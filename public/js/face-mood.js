// js/face-mood.js - Part 1: Setup and Initialization

// State variables
let isModelLoaded = false;
let isCameraRunning = false;
let continuousMode = false;
let videoElement;
let canvasElement;
let capturedMood = null;
let moodConfidence = 0;
let lastMoodChangeTime = 0;
let moodStability = 0;
const detectionFrequency = 300; // Detect mood every 300ms
const moodChangeThreshold = 2000; // Only trigger a new recommendation if mood is stable for 2 seconds
let detectionInterval;
let moodChangeCallback = null;

// Mood history for tracking changes
const moodHistory = [];
const maxHistoryLength = 10;

// Initialize the face detection system
async function initFaceDetection() {
    try {
        // Check if faceapi is defined
        if (typeof faceapi === 'undefined') {
            console.error('Face API is not loaded. Make sure the script is included correctly.');
            updateStatus('Error: Face detection library not loaded. Please reload the page.');
            return false;
        }
        
        // Load face-api.js models
        updateStatus('Loading face detection models...');
        
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        
        console.log('Face detection models loaded successfully');
        isModelLoaded = true;
        
        // Setup video and canvas elements if they don't exist
        setupVideoCanvas();
        
        updateStatus('Models loaded successfully. Ready to detect your mood.');
        
        return true;
    } catch (error) {
        console.error('Error loading face detection models:', error);
        updateStatus('Error loading models: ' + error.message);
        return false;
    }
}

// Helper function to update status message
function updateStatus(message) {
    const statusEl = document.getElementById('detection-status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Setup video and canvas elements
function setupVideoCanvas() {
    const container = document.getElementById('camera-container');
    if (!container) return;
    
    // Create video element if it doesn't exist
    if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = 'video-element';
        videoElement.width = 400;
        videoElement.height = 300;
        videoElement.autoplay = true;
        videoElement.muted = true;
        videoElement.classList.add('camera-feed');
        container.appendChild(videoElement);
    }
    
    // Create canvas element if it doesn't exist
    if (!canvasElement) {
        canvasElement = document.createElement('canvas');
        canvasElement.id = 'face-canvas';
        canvasElement.width = 400;
        canvasElement.height = 300;
        canvasElement.classList.add('face-overlay');
        container.appendChild(canvasElement);
    }
}
// js/face-mood.js - Part 2: Core Detection Functions

// Toggle mood detection on/off
async function toggleMoodDetection(enableContinuous = false) {
    const moodDetectBtn = document.getElementById('mood-detect-btn');
    const useMoodBtn = document.getElementById('use-mood-btn');
    const cameraContainer = document.getElementById('camera-container');
    
    if (!isCameraRunning) {
        // Start camera
        try {
            if (!isModelLoaded) {
                updateStatus('Loading face detection models...');
                const success = await initFaceDetection();
                if (!success) throw new Error('Failed to load face detection models');
            }
            
            updateStatus('Starting camera...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: 400, 
                    height: 300,
                    facingMode: 'user'
                } 
            });
            
            videoElement.srcObject = stream;
            isCameraRunning = true;
            
            // Button UI updates
            moodDetectBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Detection';
            if (useMoodBtn) useMoodBtn.disabled = true;
            
            updateStatus('Analyzing your facial expressions...');
            
            // Set continuous mode based on parameter
            continuousMode = enableContinuous;
            
            // Start detection loop
            startDetectionLoop();
            
            // Show the camera container
            if (cameraContainer) cameraContainer.style.display = 'block';
            document.getElementById('mood-result').style.display = 'none';
            
        } catch (error) {
            console.error('Error starting camera:', error);
            updateStatus('Error: ' + error.message);
        }
    } else {
        // Stop camera
        stopCamera();
        moodDetectBtn.innerHTML = '<i class="fas fa-camera"></i> Detect My Mood';
        updateStatus('Camera stopped');
        
        // Enable the use mood button if we've detected a mood
        if (useMoodBtn && capturedMood) {
            useMoodBtn.disabled = false;
        }
    }
}

// Start the face detection loop
function startDetectionLoop() {
    if (detectionInterval) clearInterval(detectionInterval);
    
    detectionInterval = setInterval(async () => {
        if (!isCameraRunning || !videoElement || !canvasElement) return;
        
        try {
            // Detect faces and expressions
            const detections = await faceapi.detectAllFaces(
                videoElement, 
                new faceapi.TinyFaceDetectorOptions()
            ).withFaceExpressions();
            
            // Get the canvas context for drawing
            const ctx = canvasElement.getContext('2d');
            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            
            // If faces detected, process them
            if (detections && detections.length > 0) {
                // Draw detections on canvas
                faceapi.draw.drawDetections(canvasElement, detections);
                
                // Get the primary face (first detected)
                const primaryFace = detections[0];
                const expressions = primaryFace.expressions;
                
                // Get the dominant expression
                const dominantMood = getDominantExpression(expressions);
                const moodConfidenceValue = expressions[dominantMood];
                
                // Update mood history
                updateMoodHistory(dominantMood, moodConfidenceValue);
                
                // Update UI with detected mood if confidence is high enough
                if (moodConfidenceValue > 0.5) { // 50% confidence threshold
                    // Check if mood has changed
                    const moodChanged = capturedMood !== dominantMood;
                    
                    capturedMood = dominantMood;
                    moodConfidence = moodConfidenceValue;
                    
                    // Update the UI
                    updateMoodUI(capturedMood, moodConfidenceValue);
                    
                    // Handle continuous mode and mood changes
                    if (continuousMode && moodChanged) {
                        handleMoodChange(dominantMood, moodConfidenceValue);
                    }
                }
            }
        } catch (error) {
            console.error('Error in detection loop:', error);
        }
    }, detectionFrequency);
}

// Get the dominant expression from the expressions object
function getDominantExpression(expressions) {
    return Object.keys(expressions).reduce((a, b) => 
        expressions[a] > expressions[b] ? a : b
    );
}

// Update mood history for tracking changes
function updateMoodHistory(mood, confidence) {
    // Add current mood to history
    moodHistory.push({ mood, confidence, timestamp: Date.now() });
    
    // Keep history at maximum length
    if (moodHistory.length > maxHistoryLength) {
        moodHistory.shift();
    }
    
    // Calculate mood stability (how long the same mood has been detected)
    if (moodHistory.length >= 3) {
        const currentMood = moodHistory[moodHistory.length - 1].mood;
        let sameCount = 0;
        
        // Count how many consecutive same moods
        for (let i = moodHistory.length - 1; i >= 0; i--) {
            if (moodHistory[i].mood === currentMood) {
                sameCount++;
            } else {
                break;
            }
        }
        
        moodStability = sameCount / maxHistoryLength;
    }
}
// js/face-mood.js - Part 3: UI Updates and Mood Handling

// Update UI with the detected mood
function updateMoodUI(mood, confidence) {
    const moodDisplay = document.getElementById('detected-mood');
    const confidenceDisplay = document.getElementById('mood-confidence');
    const moodResultContainer = document.getElementById('mood-result');
    const confidenceFill = document.getElementById('mood-confidence-fill');
    const useMoodBtn = document.getElementById('use-mood-btn');
    
    if (moodDisplay && confidenceDisplay) {
        // Map API mood to human-readable format
        const moodMap = {
            'neutral': 'Neutral',
            'happy': 'Happy',
            'sad': 'Sad',
            'angry': 'Angry',
            'fearful': 'Anxious',
            'disgusted': 'Disgusted',
            'surprised': 'Surprised'
        };
        
        // Set the mood text
        moodDisplay.textContent = moodMap[mood] || mood;
        
        // Set the confidence percentage
        const confidencePercent = Math.round(confidence * 100);
        confidenceDisplay.textContent = `${confidencePercent}%`;
        
        // Update confidence bar
        if (confidenceFill) {
            confidenceFill.style.width = `${confidencePercent}%`;
        }
        
        // Set the emoji
        const moodEmoji = document.getElementById('mood-emoji');
        if (moodEmoji) {
            const emojiMap = {
                'neutral': '😐',
                'happy': '😄',
                'sad': '😢',
                'angry': '😠',
                'fearful': '😨',
                'disgusted': '🤢',
                'surprised': '😮'
            };
            moodEmoji.textContent = emojiMap[mood] || '🤔';
        }
        
        // Show the result container
        moodResultContainer.style.display = 'block';
        
        // Enable the use mood button when not in continuous mode
        if (useMoodBtn && !continuousMode) {
            useMoodBtn.disabled = false;
        }
        
        // Update live mood display if in continuous mode
        if (continuousMode) {
            updateLiveMoodDisplay(mood, confidence);
        }
    }
}

// Update the live mood display in continuous mode
function updateLiveMoodDisplay(mood, confidence) {
    const liveMoodContainer = document.getElementById('live-mood');
    const liveMoodDisplay = document.getElementById('live-mood-display');
    
    if (liveMoodContainer && liveMoodDisplay) {
        liveMoodContainer.style.display = 'block';
        
        // Map moods to colors
        const moodColorMap = {
            'neutral': '#9fa8da', // blue-grey
            'happy': '#ffee58',   // yellow
            'sad': '#78909c',     // blue-grey
            'angry': '#ef5350',   // red
            'fearful': '#7e57c2', // purple
            'disgusted': '#66bb6a', // green
            'surprised': '#ab47bc'  // purple
        };
        
        // Create or update the mood indicator
        const moodColor = moodColorMap[mood] || '#9e9e9e';
        
        liveMoodDisplay.innerHTML = `
            <div class="feature-item">
                <div class="feature-name">${mood.charAt(0).toUpperCase() + mood.slice(1)}</div>
                <div class="feature-bar">
                    <div class="feature-fill" style="width: ${confidence * 100}%; background-color: ${moodColor};"></div>
                </div>
            </div>
        `;
    }
}

// Handle mood changes in continuous mode
function handleMoodChange(newMood, confidence) {
    const now = Date.now();
    
    // Only process mood changes if mood is stable enough and enough time has passed
    if (moodStability > 0.5 && (now - lastMoodChangeTime) > moodChangeThreshold) {
        lastMoodChangeTime = now;
        
        // Call the callback if set
        if (typeof moodChangeCallback === 'function') {
            moodChangeCallback(newMood, confidence);
        }
    }
}

// Get music recommendation based on detected mood
function getMoodBasedRecommendation() {
    if (!capturedMood) {
        alert('Please detect your mood first by using the camera');
        return null;
    }
    
    // Map mood to music recommendation
    const moodToMusic = {
        'neutral': 'music that matches my current neutral mood, balanced and moderate',
        'happy': 'happy, upbeat, and energetic music to maintain my good mood',
        'sad': 'uplifting, positive, and encouraging music to improve my mood',
        'angry': 'calming, soothing music with positive vibes to help me relax',
        'fearful': 'comforting, peaceful music with positive messages to reduce anxiety',
        'disgusted': 'pleasant, beautiful melodies with positive themes',
        'surprised': 'interesting and exciting music with good energy'
    };
    
    return moodToMusic[capturedMood] || 'music that matches my current mood';
}
// js/face-mood.js - Part 4: Camera Control and Public API

// Stop the camera and detection process
function stopCamera() {
    if (videoElement && videoElement.srcObject) {
        // Stop all tracks
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    // Clear detection interval
    if (detectionInterval) {
        clearInterval(detectionInterval);
        detectionInterval = null;
    }
    
    // Clear canvas
    if (canvasElement) {
        const ctx = canvasElement.getContext('2d');
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }
    
    // Hide camera container
    const cameraContainer = document.getElementById('camera-container');
    if (cameraContainer) {
        cameraContainer.style.display = 'none';
    }
    
    // Reset continuous mode
    continuousMode = false;
    
    // Hide live mood display when stopping continuous mode
    const liveMoodContainer = document.getElementById('live-mood');
    if (liveMoodContainer) {
        liveMoodContainer.style.display = 'none';
    }
    
    isCameraRunning = false;
}

// Function to use detected mood for music recommendation
function useMoodForRecommendation() {
    if (!capturedMood) {
        alert('Please detect your mood first');
        return;
    }
    
    // Get recommendation text based on mood
    const recommendationText = getMoodBasedRecommendation();
    
    // Set the recommendation text in the preference input
    const preferenceInput = document.getElementById('preference');
    if (preferenceInput) {
        preferenceInput.value = recommendationText;
    }
    
    // Optionally, automatically trigger the recommendation
    const recommendBtn = document.getElementById('recommend-btn');
    if (recommendBtn) {
        recommendBtn.click();
    }
    
    // Stop the camera after using the mood
    stopCamera();
    const moodDetectBtn = document.getElementById('mood-detect-btn');
    if (moodDetectBtn) {
        moodDetectBtn.innerHTML = '<i class="fas fa-camera"></i> Detect My Mood';
    }
    
    // Scroll to results
    setTimeout(() => {
        const resultsSection = document.getElementById('results');
        if (resultsSection) {
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        }
    }, 1500);
}

// Start continuous mode for real-time recommendations
function startContinuousDetection(callback) {
    moodChangeCallback = callback;
    toggleMoodDetection(true); // true enables continuous mode
    
    // Show live mood display
    const liveMoodContainer = document.getElementById('live-mood');
    if (liveMoodContainer) {
        liveMoodContainer.style.display = 'block';
    }
}

// Cleanup function to be called when navigating away
function cleanup() {
    stopCamera();
    moodChangeCallback = null;
}

// Register event listeners when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    const moodDetectBtn = document.getElementById('mood-detect-btn');
    const useMoodBtn = document.getElementById('use-mood-btn');
    
    if (moodDetectBtn) {
        moodDetectBtn.addEventListener('click', () => toggleMoodDetection(false));
    }
    
    if (useMoodBtn) {
        useMoodBtn.addEventListener('click', useMoodForRecommendation);
        // Initially disable the use mood button
        useMoodBtn.disabled = true;
    }
});

// Export functions for global access
window.faceDetection = {
    init: initFaceDetection,
    toggle: toggleMoodDetection,
    useMood: useMoodForRecommendation,
    startContinuous: startContinuousDetection,
    stopDetection: stopCamera,
    getCurrentMood: () => ({ mood: capturedMood, confidence: moodConfidence }),
    cleanup: cleanup
};
