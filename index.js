// index.js - Main server file with Spotify integration
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createRequire } from 'module';
import { getRecommendations, getAudioFeatures, getColorFromFeatures } from './spotify-service.js';
import natural from 'natural';
import _ from 'lodash';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// NLP tokenizer for text analysis
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Fallback feature vector generation if Spotify API fails
function analyzePreference(text) {
  // Convert to lowercase and tokenize
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const stemmed = tokens.map(token => stemmer.stem(token));
  
  // Simple keyword mapping to feature weights
  const keywordMapping = {
    // Energy
    energet: 0.9, energiz: 0.9, power: 0.8, strong: 0.8, intense: 0.9, 
    calm: 0.1, relax: 0.1, gentle: 0.2, soft: 0.2, smooth: 0.3,
    
    // Tempo
    fast: 0.9, quick: 0.8, rapid: 0.9, upbeat: 0.8, 
    slow: 0.1, deliber: 0.3, steady: 0.4, laidback: 0.2,
    
    // Danceability
    danc: 0.9, groove: 0.8, rhythm: 0.7, beat: 0.7, 
    melod: 0.3, harmon: 0.2, lyric: 0.3, 
    
    // Mood (Valence)
    happy: 0.9, excit: 0.8, joy: 0.9, uplift: 0.8, positiv: 0.7,
    sad: 0.1, melanchol: 0.2, depress: 0.1, somber: 0.2, dark: 0.3,
    
    // Popularity
    popular: 0.9, mainstream: 0.8, hit: 0.9, chart: 0.8,
    obscur: 0.1, underground: 0.2, indie: 0.3, unknown: 0.1
  };
  
  // Genre mapping
  const genreMapping = {
    rock: [0.7, 0.5, 0.4, 0.6, 0.7],
    pop: [0.5, 0.7, 0.8, 0.6, 0.9],
    jazz: [0.4, 0.3, 0.2, 0.7, 0.3],
    hiphop: [0.6, 0.8, 0.7, 0.5, 0.8],
    rap: [0.7, 0.7, 0.6, 0.4, 0.7],
    classic: [0.3, 0.2, 0.1, 0.8, 0.5],
    electron: [0.8, 0.9, 0.9, 0.4, 0.7],
    country: [0.4, 0.4, 0.5, 0.6, 0.6],
    metal: [0.9, 0.7, 0.3, 0.3, 0.5],
    folk: [0.2, 0.3, 0.3, 0.7, 0.4],
    indie: [0.5, 0.5, 0.4, 0.6, 0.3]
  };
  
  // Initial feature vector
  let featureVector = [0.5, 0.5, 0.5, 0.5, 0.5]; // [energy, tempo, danceability, mood, popularity]
  let matchCount = 0;
  
  // Process keywords
  for (const token of stemmed) {
    // Check for keyword matches
    for (const [keyword, weight] of Object.entries(keywordMapping)) {
      if (token.includes(keyword)) {
        // Map keywords to appropriate feature dimensions
        if (['energet', 'energiz', 'power', 'strong', 'intense', 'calm', 'relax', 'gentle', 'soft', 'smooth'].includes(keyword)) {
          featureVector[0] = (featureVector[0] + weight) / 2; // Energy
        } else if (['fast', 'quick', 'rapid', 'upbeat', 'slow', 'deliber', 'steady', 'laidback'].includes(keyword)) {
          featureVector[1] = (featureVector[1] + weight) / 2; // Tempo
        } else if (['danc', 'groove', 'rhythm', 'beat', 'melod', 'harmon', 'lyric'].includes(keyword)) {
          featureVector[2] = (featureVector[2] + weight) / 2; // Danceability
        } else if (['happy', 'excit', 'joy', 'uplift', 'positiv', 'sad', 'melanchol', 'depress', 'somber', 'dark'].includes(keyword)) {
          featureVector[3] = (featureVector[3] + weight) / 2; // Mood
        } else if (['popular', 'mainstream', 'hit', 'chart', 'obscur', 'underground', 'indie', 'unknown'].includes(keyword)) {
          featureVector[4] = (featureVector[4] + weight) / 2; // Popularity
        }
        matchCount++;
      }
    }
    
    // Check for genre matches
    for (const [genre, features] of Object.entries(genreMapping)) {
      if (token.includes(genre)) {
        // Blend genre features into our vector
        featureVector = featureVector.map((val, idx) => (val + features[idx]) / 2);
        matchCount++;
      }
    }
  }
  
  // If no matches found, keep default vector
  return featureVector;
}

// API endpoint for music recommendations using Spotify
app.post('/api/recommend', async (req, res) => {
  try {
    const { preference } = req.body;
    
    if (!preference) {
      return res.status(400).json({ error: 'Preference text is required' });
    }
    
    // Analyze user preference to get feature vector (fallback if Spotify fails)
    const preferenceVector = analyzePreference(preference);
    
    try {
      // Check Spotify API health before making the request
      const healthCheck = await checkSpotifyHealth();
      
      if (healthCheck.status !== 'ok') {
        console.warn('Spotify API health check failed, using fallback:', healthCheck);
        throw new Error('Spotify API unavailable: ' + (healthCheck.message || 'Unknown error'));
      }
      
      // Get recommendations from Spotify
      const spotifyRecommendations = await getRecommendations(preference);
      
      // If we didn't get any recommendations, use fallback
      if (!spotifyRecommendations || spotifyRecommendations.length === 0) {
        throw new Error('No recommendations returned from Spotify API');
      }
      
      // Fetch audio features for each track to enhance the response
      const enhancedRecommendations = await Promise.allSettled(
        spotifyRecommendations.map(async (track) => {
          try {
            // Get detailed audio features if track ID is available
            if (track.id) {
              const features = await getAudioFeatures(track.id);
              
              if (!features) {
                return track;
              }
              
              // Generate a color based on the audio features
              const color = getColorFromFeatures(features);
              
              // Return track with audio features and generated color
              return {
                ...track,
                audioFeatures: {
                  energy: features.energy,
                  tempo: features.tempo,
                  danceability: features.danceability,
                  valence: features.valence,
                  acousticness: features.acousticness,
                  instrumentalness: features.instrumentalness
                },
                color
              };
            }
            return track;
          } catch (error) {
            console.warn('Error getting audio features for track:', error.message || error);
            return track;
          }
        })
      ).then(results => 
        // Filter out any rejected promises and get the fulfilled values
        results
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value)
      );
      
      // Return response with Spotify recommendations
      res.json({
        query: preference,
        featureVector: preferenceVector,
        recommendations: enhancedRecommendations,
        source: 'spotify'
      });
      
    } catch (spotifyError) {
      console.error('Spotify API error, using fallback:', spotifyError.message || spotifyError);
      
      // Use static music database as fallback
      const recommendations = getStaticRecommendations(preferenceVector);
      
      // Return response with static recommendations
      res.json({
        query: preference,
        featureVector: preferenceVector,
        recommendations: recommendations.slice(0, 6),
        source: 'fallback'
      });
    }
    
  } catch (error) {
    console.error('Error in recommendation:', error.message || error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

function getStaticRecommendations(featureVector) {
  // Static music database for fallback
  const staticMusicDatabase = [
    { 
      id: 1, 
      title: "Bohemian Rhapsody", 
      artist: "Queen", 
      genres: ["rock", "progressive rock"], 
      features: [0.8, 0.9, 0.5, 0.2, 0.7],
      color: "#E53935"
    },
    { 
      id: 2, 
      title: "Billie Jean", 
      artist: "Michael Jackson", 
      genres: ["pop", "dance"], 
      features: [0.7, 0.4, 0.9, 0.6, 0.3],
      color: "#3949AB"
    },
    { 
      id: 3, 
      title: "Smells Like Teen Spirit", 
      artist: "Nirvana", 
      genres: ["rock", "grunge"], 
      features: [0.9, 0.2, 0.4, 0.8, 0.6],
      color: "#43A047"
    },
    { 
      id: 4, 
      title: "Superstition", 
      artist: "Stevie Wonder", 
      genres: ["funk", "soul"], 
      features: [0.6, 0.8, 0.7, 0.5, 0.9],
      color: "#FB8C00"
    },
    { 
      id: 5, 
      title: "Lose Yourself", 
      artist: "Eminem", 
      genres: ["hip hop", "rap"], 
      features: [0.5, 0.3, 0.8, 0.9, 0.2],
      color: "#8E24AA"
    },
    { 
      id: 6, 
      title: "Sweet Child O' Mine", 
      artist: "Guns N' Roses", 
      genres: ["rock", "hard rock"], 
      features: [0.9, 0.7, 0.3, 0.4, 0.6],
      color: "#D81B60"
    },
    { 
      id: 7, 
      title: "Despacito", 
      artist: "Luis Fonsi", 
      genres: ["latin", "pop"], 
      features: [0.4, 0.9, 0.7, 0.3, 0.8],
      color: "#FFB300"
    },
    { 
      id: 8, 
      title: "Stairway to Heaven", 
      artist: "Led Zeppelin", 
      genres: ["rock", "classic rock"], 
      features: [0.7, 0.6, 0.4, 0.5, 0.8],
      color: "#00897B"
    },
    { 
      id: 9, 
      title: "Thriller", 
      artist: "Michael Jackson", 
      genres: ["pop", "funk"], 
      features: [0.8, 0.5, 0.9, 0.4, 0.6],
      color: "#C62828"
    },
    { 
      id: 10, 
      title: "Like a Rolling Stone", 
      artist: "Bob Dylan", 
      genres: ["rock", "folk rock"], 
      features: [0.6, 0.7, 0.3, 0.8, 0.4],
      color: "#1565C0"
    },
    { 
      id: 11, 
      title: "Hotel California", 
      artist: "Eagles", 
      genres: ["rock", "soft rock"], 
      features: [0.5, 0.8, 0.6, 0.7, 0.3],
      color: "#6A1B9A"
    },
    { 
      id: 12, 
      title: "Shape of You", 
      artist: "Ed Sheeran", 
      genres: ["pop", "dancehall"], 
      features: [0.3, 0.9, 0.8, 0.5, 0.7],
      color: "#2E7D32"
    }
  ];
  
  // Helper function for cosine similarity
  const cosineSimilarity = (vecA, vecB) => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };
  
  const recommendations = staticMusicDatabase.map(song => {
    const similarity = cosineSimilarity(featureVector, song.features);
    return { 
      ...song, 
      similarity,
      // Add these fields to match Spotify structure
      albumArt: null,
      previewUrl: null,
      externalUrl: null,
      audioFeatures: {
        energy: song.features[0],
        tempo: song.features[1] * 160,  // Scale to bpm range
        danceability: song.features[2],
        valence: song.features[3],
        acousticness: 0.5,  // Default value
        instrumentalness: 0.5  // Default value
      }
    };
  });
  
  // Sort by similarity score (highest first)
  return _.sortBy(recommendations, song => -song.similarity);
}

// Add a health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const spotifyHealth = await checkSpotifyHealth();
    
    res.json({
      status: 'ok',
      spotify: spotifyHealth,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});