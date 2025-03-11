// js/app.js - Part 1: Setup and Initialization

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const preferenceInput = document.getElementById('preference');
    const recommendBtn = document.getElementById('recommend-btn');
    const loadingSection = document.getElementById('loading');
    const resultsSection = document.getElementById('results');
    const recommendationsGrid = document.getElementById('recommendations');
    const featureBars = document.getElementById('feature-bars');
    const sourceText = document.getElementById('source-text');
    
    // Audio player reference
    let currentAudio = null;
    let currentlyPlayingId = null;
    
    // Application state
    let isInContinuousMode = false;
    let lastRecommendedMood = null;
    
    // Feature names and colors for visualization
    const features = [
        { name: 'Energy', color: '#2196f3' },
        { name: 'Tempo', color: '#4caf50' },
        { name: 'Danceability', color: '#673ab7' },
        { name: 'Mood (Valence)', color: '#ff4081' },
        { name: 'Popularity', color: '#ff9800' }
    ];
    
    // Album cover patterns for fallback when no album art is available
    const albumPatterns = [
        'linear-gradient(120deg, #f57c00, #ffb74d)',
        'linear-gradient(120deg, #1976d2, #64b5f6)',
        'linear-gradient(120deg, #388e3c, #81c784)',
        'linear-gradient(120deg, #7b1fa2, #ba68c8)',
        'linear-gradient(120deg, #d32f2f, #ef5350)',
        'linear-gradient(120deg, #00796b, #4db6ac)',
        'linear-gradient(120deg, #1565c0, #42a5f5)',
        'linear-gradient(120deg, #afb42b, #dce775)',
        'linear-gradient(120deg, #512da8, #9575cd)',
        'linear-gradient(120deg, #c2185b, #f06292)',
        'linear-gradient(120deg, #e64a19, #ff8a65)',
        'linear-gradient(120deg, #0097a7, #4dd0e1)'
    ];
    
    // Initialize face detection if available
    if (window.faceDetection && window.faceDetection.init) {
        window.faceDetection.init();
    }
    
    // Add the main recommendation button handler
    recommendBtn.addEventListener('click', function() {
        getRecommendations();
    });
    
    // Add button to enable continuous mode
    const moodDetectBtn = document.getElementById('mood-detect-btn');
    const useMoodBtn = document.getElementById('use-mood-btn');
    
    if (moodDetectBtn) {
        // Regular mode already handled in face-mood.js
    }
    
    if (useMoodBtn) {
        // Update to handle continuous mode
        useMoodBtn.addEventListener('click', function() {
            if (isInContinuousMode) {
                stopContinuousMode();
            } else {
                const moodData = window.faceDetection.getCurrentMood();
                if (moodData && moodData.mood) {
                    useMoodForRecommendation(moodData.mood);
                } else {
                    alert('Please detect your mood first');
                }
            }
        });
    }
    // js/app.js - Part 2: Recommendation Functions

    // Function to get recommendations from the server
    async function getRecommendations(moodOverride = null) {
        // Get the preference text from the input, or use the mood override
        let preference = preferenceInput.value.trim();
        
        // If a mood is provided, override the preference
        if (moodOverride) {
            // Use the mood mapping to get an appropriate query
            const moodToMusicMap = {
                'neutral': 'balanced and moderate music',
                'happy': 'happy, upbeat, and energetic music',
                'sad': 'uplifting, positive, and encouraging music',
                'angry': 'calming, soothing music with positive vibes',
                'fearful': 'comforting, peaceful music with positive messages',
                'disgusted': 'pleasant, beautiful melodies with positive themes',
                'surprised': 'interesting and exciting music with good energy'
            };
            
            preference = moodToMusicMap[moodOverride] || 'music that matches my mood';
            
            // In continuous mode, only update if mood has changed
            if (isInContinuousMode && moodOverride === lastRecommendedMood) {
                return; // Skip if same mood
            }
            
            // Update the last recommended mood
            lastRecommendedMood = moodOverride;
        }
        
        if (!preference) {
            alert('Please describe what kind of music you\'re looking for or use mood detection.');
            return;
        }
        
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            currentlyPlayingId = null;
        }
        
        // Show loading (unless in continuous mode with existing results)
        if (!isInContinuousMode || !resultsSection.style.display || resultsSection.style.display === 'none') {
            loadingSection.style.display = 'block';
            resultsSection.style.display = 'none';
        }
        
        try {
            // Make API request
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preference })
            });
            
            if (!response.ok) {
                throw new Error('Failed to get recommendations');
            }
            
            const data = await response.json();
            
            // Process the results
            processRecommendations(data, isInContinuousMode);
            
        } catch (error) {
            console.error('Error:', error);
            loadingSection.style.display = 'none';
            alert('An error occurred. Please try again.');
        }
    }
    
    // Process recommendations data and update UI
    function processRecommendations(data, useAnimations = false) {
        // Use a slight delay to show loading animation (unless in continuous mode)
        const processingDelay = useAnimations ? 0 : 1000;
        
        setTimeout(() => {
            // Hide loading, show results
            loadingSection.style.display = 'none';
            resultsSection.style.display = 'block';
            
            // Update the source info
            if (data.source === 'spotify') {
                sourceText.textContent = 'Spotify API';
            } else {
                sourceText.textContent = 'Fallback Database';
            }
            
            // Render feature analysis
            renderFeatureAnalysis(data.featureVector);
            
            // Render recommendations
            renderRecommendations(data.recommendations, useAnimations);
            
            // Scroll to results if not in continuous mode
            if (!isInContinuousMode) {
                resultsSection.scrollIntoView({ behavior: 'smooth' });
            }
        }, processingDelay);
    }
    // js/app.js - Part 3: UI Rendering Functions

    // Render feature analysis visualization
    function renderFeatureAnalysis(featureVector) {
        featureBars.innerHTML = '';
        
        features.forEach((feature, index) => {
            const value = featureVector[index];
            
            const featureItem = document.createElement('div');
            featureItem.className = 'feature-item';
            
            const featureName = document.createElement('div');
            featureName.className = 'feature-name';
            featureName.textContent = feature.name;
            
            const featureBar = document.createElement('div');
            featureBar.className = 'feature-bar';
            
            const featureFill = document.createElement('div');
            featureFill.className = 'feature-fill';
            featureFill.style.backgroundColor = feature.color;
            
            // Set width with a delay for animation
            setTimeout(() => {
                featureFill.style.width = `${value * 100}%`;
            }, 100 + index * 100);
            
            featureBar.appendChild(featureFill);
            featureItem.appendChild(featureName);
            featureItem.appendChild(featureBar);
            
            featureBars.appendChild(featureItem);
        });
    }
    
    // Render recommendation cards
    function renderRecommendations(recommendations, animate = false) {
        if (!animate) {
            // If not animating, clear the grid
            recommendationsGrid.innerHTML = '';
        }
        
        recommendations.forEach((song, index) => {
            // Create card container
            const card = document.createElement('div');
            card.className = 'recommendation-card';
            card.setAttribute('data-song-id', song.id || index);
            
            // In animation mode, use staggered animations
            if (animate) {
                card.style.animation = `cardReveal 0.5s cubic-bezier(0.19, 1, 0.22, 1) ${index * 0.1}s both`;
                
                // If the card already exists, replace it instead of adding a new one
                const existingCard = document.querySelector(`.recommendation-card[data-song-id="${song.id || index}"]`);
                if (existingCard) {
                    existingCard.parentNode.replaceChild(card, existingCard);
                } else {
                    recommendationsGrid.appendChild(card);
                }
            } else {
                recommendationsGrid.appendChild(card);
            }
            
            const scorePercentage = Math.round(song.similarity * 100);
            
            // Choose background for the header
            let background;
            if (song.albumArt) {
                background = `url(${song.albumArt})`;
            } else if (song.color) {
                background = song.color;
            } else {
                background = albumPatterns[index % albumPatterns.length];
            }
            
            // Create genres HTML
            let genresHTML = '';
            if (song.genres && song.genres.length > 0) {
                genresHTML = song.genres.map(genre => 
                    `<span class="genre-tag">${genre}</span>`
                ).join('');
            }
            
            // Create preview button HTML
            let previewButtonHTML = '';
            if (song.previewUrl) {
                previewButtonHTML = `
                    <div class="audio-controls">
                        <button class="play-btn" data-track-id="${song.id}" data-preview-url="${song.previewUrl}">
                            <i class="fas fa-play"></i> Preview
                        </button>
                    </div>
                `;
            } else {
                previewButtonHTML = `
                    <div class="audio-controls">
                        <button class="play-btn disabled">
                            <i class="fas fa-volume-mute"></i> No preview available
                        </button>
                    </div>
                `;
            }
            
            // Create external link if available
            let externalLinkHTML = '';
            if (song.externalUrl) {
                externalLinkHTML = `
                    <a href="${song.externalUrl}" target="_blank" class="external-link">
                        Open in Spotify <i class="fas fa-external-link-alt"></i>
                    </a>
                `;
            }
            
            card.innerHTML = `
                <div class="rec-card-header">
                    <div class="rec-card-bg" style="background: ${background}"></div>
                    <div class="rec-card-content">
                        <h3 class="rec-title">${song.title}</h3>
                        <p class="rec-artist">${song.artist}</p>
                    </div>
                </div>
                <div class="rec-card-body">
                    <div class="genre-tags">
                        ${genresHTML}
                    </div>
                    ${previewButtonHTML}
                    <div class="match-score">
                        <div class="match-label">
                            <span>Match</span>
                            <span class="match-value">${scorePercentage}%</span>
                        </div>
                        <div class="match-bar">
                            <div class="match-fill" style="width: ${scorePercentage}%"></div>
                        </div>
                    </div>
                    ${externalLinkHTML}
                </div>
            `;
        });
        
        // Add event listeners to play buttons
        document.querySelectorAll('.play-btn:not(.disabled)').forEach(button => {
            button.addEventListener('click', handlePlayClick);
        });
    }
    // js/app.js - Part 4: Audio and Continuous Mode

    // Handle audio preview button clicks
    function handlePlayClick(event) {
        const button = event.currentTarget;
        const previewUrl = button.getAttribute('data-preview-url');
        const trackId = button.getAttribute('data-track-id');
        
        // If this is already playing, pause it
        if (currentlyPlayingId === trackId && currentAudio) {
            currentAudio.pause();
            button.innerHTML = '<i class="fas fa-play"></i> Preview';
            currentAudio = null;
            currentlyPlayingId = null;
            return;
        }
        
        // Reset any other playing buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.innerHTML = '<i class="fas fa-play"></i> Preview';
        });
        
        // Stop current audio if any
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        // Play the new preview
        currentAudio = new Audio(previewUrl);
        currentlyPlayingId = trackId;
        
        button.innerHTML = '<i class="fas fa-pause"></i> Playing...';
        
        currentAudio.play();
        
        // When audio ends, reset button
        currentAudio.onended = function() {
            button.innerHTML = '<i class="fas fa-play"></i> Preview';
            currentAudio = null;
            currentlyPlayingId = null;
        };
    }
    
    // Function to start continuous mode
    function startContinuousMode() {
        if (!window.faceDetection || !window.faceDetection.startContinuous) {
            alert('Face detection is not available');
            return;
        }
        
        isInContinuousMode = true;
        
        // Update UI to show we're in continuous mode
        const useMoodBtn = document.getElementById('use-mood-btn');
        if (useMoodBtn) {
            useMoodBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Continuous Mode';
        }
        
        // Show the live mood display
        const liveMoodContainer = document.getElementById('live-mood');
        if (liveMoodContainer) {
            liveMoodContainer.style.display = 'block';
        }
        
        // Start continuous detection with a callback for mood changes
        window.faceDetection.startContinuous(handleMoodChange);
        
        // Add notification
        showNotification('Continuous mode activated! Music will change with your mood', 'info');
    }
    
    // Function to stop continuous mode
    function stopContinuousMode() {
        if (!window.faceDetection || !window.faceDetection.stopDetection) {
            return;
        }
        
        isInContinuousMode = false;
        
        // Update UI
        const useMoodBtn = document.getElementById('use-mood-btn');
        if (useMoodBtn) {
            useMoodBtn.innerHTML = '<i class="fas fa-wand-magic-sparkles"></i> Use My Mood';
        }
        
        // Hide the live mood display
        const liveMoodContainer = document.getElementById('live-mood');
        if (liveMoodContainer) {
            liveMoodContainer.style.display = 'none';
        }
        
        // Stop detection
        window.faceDetection.stopDetection();
        
        // Add notification
        showNotification('Continuous mode deactivated', 'info');
    }
    
    // Handle mood changes in continuous mode
    function handleMoodChange(newMood, confidence) {
        console.log(`Mood changed to ${newMood} with confidence ${confidence}`);
        
        // Only get new recommendations if confidence is high enough
        if (confidence > 0.6) {
            // Get new recommendations based on mood
            getRecommendations(newMood);
            
            // Show notification of mood change
            const moodMap = {
                'neutral': 'Neutral',
                'happy': 'Happy',
                'sad': 'Sad',
                'angry': 'Angry',
                'fearful': 'Anxious',
                'disgusted': 'Disgusted',
                'surprised': 'Surprised'
            };
            
            showNotification(`Mood detected: ${moodMap[newMood] || newMood}. Updating your recommendations...`, 'mood');
        }
    }
    
    // Use detected mood for recommendation
    function useMoodForRecommendation(mood) {
        if (!mood) {
            const moodData = window.faceDetection.getCurrentMood();
            mood = moodData.mood;
        }
        
        if (!mood) {
            alert('Please detect your mood first');
            return;
        }
        
        // Get recommendation text based on mood
        const moodToMusic = {
            'neutral': 'balanced and moderate music',
            'happy': 'happy, upbeat, and energetic music',
            'sad': 'uplifting, positive, and encouraging music',
            'angry': 'calming, soothing music with positive vibes',
            'fearful': 'comforting, peaceful music with positive messages',
            'disgusted': 'pleasant, beautiful melodies with positive themes',
            'surprised': 'interesting and exciting music with good energy'
        };
        
        const recommendationText = moodToMusic[mood] || 'music that matches my current mood';
        
        // Set the recommendation text in the preference input
        if (preferenceInput) {
            preferenceInput.value = recommendationText;
        }
        
        // Get recommendations
        getRecommendations(mood);
    }// js/app.js - Part 5: Helper Functions and Initialization

    // Show notification
    function showNotification(message, type = 'info') {
        // Create notification element if it doesn't exist
        let notificationContainer = document.getElementById('notification-container');
        
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.id = 'notification-container';
            notificationContainer.style.position = 'fixed';
            notificationContainer.style.bottom = '20px';
            notificationContainer.style.right = '20px';
            notificationContainer.style.zIndex = '1000';
            document.body.appendChild(notificationContainer);
        }
        
        // Create notification
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.backgroundColor = type === 'info' ? '#2196f3' : '#4caf50';
        notification.style.color = 'white';
        notification.style.padding = '12px 16px';
        notification.style.marginTop = '10px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';
        notification.style.justifyContent = 'space-between';
        notification.style.maxWidth = '300px';
        notification.style.animation = 'slideIn 0.3s forwards';
        
        // Add icon based on type
        const icon = document.createElement('i');
        icon.className = type === 'info' ? 'fas fa-info-circle' : 'fas fa-music';
        icon.style.marginRight = '10px';
        
        // Create message div
        const messageDiv = document.createElement('div');
        messageDiv.style.flexGrow = '1';
        messageDiv.textContent = message;
        
        // Create close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'white';
        closeBtn.style.fontSize = '20px';
        closeBtn.style.marginLeft = '10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = function() {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        };
        
        // Assemble notification
        notification.appendChild(icon);
        notification.appendChild(messageDiv);
        notification.appendChild(closeBtn);
        
        // Add to container
        notificationContainer.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }
    
    // Add CSS for notifications
    function addNotificationStyles() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            .notification {
                transition: opacity 0.3s ease;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add continuous mode toggle button to UI if it doesn't exist
    function addContinuousModeButton() {
        const useMoodBtn = document.getElementById('use-mood-btn');
        
        if (useMoodBtn) {
            // Add data attribute to track continuous mode state
            useMoodBtn.setAttribute('data-continuous', 'false');
            
            // Update click handler to toggle continuous mode
            useMoodBtn.addEventListener('click', function() {
                const isContinuous = useMoodBtn.getAttribute('data-continuous') === 'true';
                
                if (isContinuous) {
                    stopContinuousMode();
                    useMoodBtn.setAttribute('data-continuous', 'false');
                } else {
                    // Only if we have a mood detected
                    const moodData = window.faceDetection.getCurrentMood();
                    if (moodData && moodData.mood) {
                        startContinuousMode();
                        useMoodBtn.setAttribute('data-continuous', 'true');
                    } else {
                        useMoodForRecommendation();
                    }
                }
            });
        }
    }
    
    // Set a default example for demo purposes
    preferenceInput.value = "I want something energetic with a strong beat that I can work out to. I enjoy electronic music with powerful drops and high energy.";
    
    // Add notification styles
    addNotificationStyles();
    
    // Add continuous mode toggle
    addContinuousModeButton();
    
    // Clean up when the page is closed
    window.addEventListener('beforeunload', function() {
        // Stop any playing audio
        if (currentAudio) {
            currentAudio.pause();
        }
        
        // Stop face detection if running
        if (window.faceDetection && window.faceDetection.cleanup) {
            window.faceDetection.cleanup();
        }
    });
});
