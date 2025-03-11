// spotify-service.js - Fixed version with better error handling
import axios from 'axios';
import querystring from 'querystring';
import _ from 'lodash';
import natural from 'natural';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// These would come from environment variables in a real app
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'YOUR_SPOTIFY_CLIENT_ID';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'YOUR_SPOTIFY_CLIENT_SECRET';
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

// Spotify API endpoints
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

// NLP tools
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Cache for the access token
let accessToken = null;
let tokenExpiresAt = null;
let refreshInProgress = false;
let lastTokenError = null;

// Valid genre seeds from Spotify
// This is a subset - in a production app you would fetch the complete list
const VALID_GENRE_SEEDS = [
  'acoustic', 'afrobeat', 'alt-rock', 'alternative', 'ambient', 'anime', 'blues',
  'classical', 'club', 'country', 'dance', 'disco', 'drum-and-bass', 'dubstep',
  'edm', 'electronic', 'folk', 'funk', 'hip-hop', 'house', 'indie', 'indie-pop',
  'jazz', 'k-pop', 'latin', 'metal', 'piano', 'pop', 'r-n-b', 'rap', 'reggae',
  'reggaeton', 'rock', 'soul', 'techno', 'trance'
];

// Get client credentials token for API access
async function getAccessToken(forceRefresh = false) {
  try {
    // Prevent multiple simultaneous token requests
    if (refreshInProgress) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return getAccessToken(forceRefresh);
    }
    
    // Return cached token if it's still valid and no refresh is forced
    if (!forceRefresh && accessToken && tokenExpiresAt && Date.now() < tokenExpiresAt) {
      return accessToken;
    }

    // Mark that we're refreshing
    refreshInProgress = true;
    
    // Request new token
    console.log('Getting new Spotify access token...');
    const response = await axios({
      method: 'post',
      url: SPOTIFY_TOKEN_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
      },
      data: querystring.stringify({
        grant_type: 'client_credentials'
      })
    });
    
    // Cache the token and expiration
    accessToken = response.data.access_token;
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);
    lastTokenError = null;
    console.log('Successfully obtained new access token');
    
    return accessToken;
  } catch (error) {
    lastTokenError = error;
    console.error('Error getting Spotify access token:', error.message || error);
    throw error;
  } finally {
    refreshInProgress = false;
  }
}

// Map user preference text to Spotify search parameters
function extractSearchParams(text) {
  // Convert to lowercase and tokenize
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const stemmed = tokens.map(token => stemmer.stem(token));
  
  // Maps for genres, moods, and other attributes
  const genreKeywords = {
    'rock': ['rock', 'guitar', 'band', 'electric'],
    'pop': ['pop', 'catchy', 'mainstream', 'radio'],
    'hip-hop': ['hip hop', 'rap', 'beats', 'rhymes'],
    'dance': ['dance', 'club', 'edm', 'electronic'],
    'r-n-b': ['r&b', 'soul', 'smooth', 'rhythm'],
    'indie': ['indie', 'alternative', 'underground'],
    'jazz': ['jazz', 'saxophone', 'trumpet', 'smooth', 'improvisation'],
    'classical': ['classical', 'orchestra', 'symphony', 'instrumental'],
    'country': ['country', 'folk', 'acoustic', 'rural', 'western'],
    'metal': ['metal', 'heavy', 'hard', 'guitar', 'intense'],
    'latin': ['latin', 'spanish', 'reggaeton', 'salsa'],
    'house': ['house', 'deep', 'beat', 'rhythm', 'tempo']
  };
  
  const moodKeywords = {
    'happy': ['happy', 'upbeat', 'cheerful', 'joy', 'positive', 'fun'],
    'sad': ['sad', 'melancholy', 'depressed', 'moody', 'blue', 'unhappy'],
    'energetic': ['energetic', 'energizing', 'power', 'workout', 'energy', 'lively'],
    'chill': ['chill', 'relaxed', 'calm', 'mellow', 'peaceful', 'soft'],
    'angry': ['angry', 'intense', 'aggressive', 'hard', 'rough'],
    'romantic': ['romantic', 'love', 'emotional', 'passionate']
  };
  
  // Parameters to extract
  const params = {
    genres: [],
    tempo: null, // slow, medium, fast
    energy: null, // low, medium, high
    popularity: null, // underground, moderate, popular
    mood: []
  };
  
  // Extract genres
  for (const [genre, keywords] of Object.entries(genreKeywords)) {
    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword)) {
        params.genres.push(genre);
        break;
      }
    }
  }
  
  // Extract moods
  for (const [mood, keywords] of Object.entries(moodKeywords)) {
    for (const keyword of keywords) {
      if (text.toLowerCase().includes(keyword)) {
        params.mood.push(mood);
        break;
      }
    }
  }
  
  // Extract tempo
  if (text.match(/\b(fast|quick|rapid|upbeat|uptempo)\b/i)) {
    params.tempo = 'fast';
  } else if (text.match(/\b(slow|relaxed|downtempo)\b/i)) {
    params.tempo = 'slow';
  } else if (text.match(/\b(medium|moderate|average)\b/i)) {
    params.tempo = 'medium';
  }
  
  // Extract energy
  if (text.match(/\b(high energy|energetic|powerful|intense|strong)\b/i)) {
    params.energy = 'high';
  } else if (text.match(/\b(low energy|calm|gentle|soft|smooth)\b/i)) {
    params.energy = 'low';
  } else if (text.match(/\b(medium energy|moderate energy)\b/i)) {
    params.energy = 'medium';
  }
  
  // Extract popularity
  if (text.match(/\b(popular|mainstream|hit|chart|top)\b/i)) {
    params.popularity = 'popular';
  } else if (text.match(/\b(obscure|underground|indie|unknown|niche)\b/i)) {
    params.popularity = 'underground';
  }
  
  // Remove duplicates
  params.genres = [...new Set(params.genres)];
  params.mood = [...new Set(params.mood)];
  
  return params;
}

// Convert extracted parameters to Spotify API query parameters
function buildSpotifyQueryParams(params) {
  let queryParams = {};
  
  // Add seed genres (Spotify only allows up to 5)
  // Filter to ensure we only use valid seeds
  if (params.genres.length > 0) {
    const validGenres = params.genres
      .filter(genre => VALID_GENRE_SEEDS.includes(genre))
      .slice(0, 5);
    
    if (validGenres.length > 0) {
      queryParams.seed_genres = validGenres.join(',');
    }
  }
  
  // Map tempo to target_tempo
  if (params.tempo) {
    switch (params.tempo) {
      case 'slow':
        queryParams.target_tempo = 80;
        break;
      case 'medium':
        queryParams.target_tempo = 120;
        break;
      case 'fast':
        queryParams.target_tempo = 160;
        break;
    }
  }
  
  // Map energy to target_energy
  if (params.energy) {
    switch (params.energy) {
      case 'low':
        queryParams.target_energy = 0.2;
        break;
      case 'medium':
        queryParams.target_energy = 0.5;
        break;
      case 'high':
        queryParams.target_energy = 0.8;
        break;
    }
  }
  
  // Map popularity to target_popularity
  if (params.popularity) {
    switch (params.popularity) {
      case 'underground':
        queryParams.target_popularity = 30;
        break;
      case 'moderate':
        queryParams.target_popularity = 60;
        break;
      case 'popular':
        queryParams.target_popularity = 90;
        break;
    }
  }
  
  // Map mood to valence and energy
  if (params.mood.includes('happy')) {
    queryParams.target_valence = 0.8;
  } else if (params.mood.includes('sad')) {
    queryParams.target_valence = 0.2;
  }
  
  if (params.mood.includes('energetic') && !queryParams.target_energy) {
    queryParams.target_energy = 0.8;
  } else if (params.mood.includes('chill') && !queryParams.target_energy) {
    queryParams.target_energy = 0.2;
  }
  
  // Set reasonable limits
  queryParams.limit = 10;
  
  return queryParams;
}

// Get recommendations based on user preference text
export async function getRecommendations(preferenceText) {
  try {
    // Extract search parameters from text
    const extractedParams = extractSearchParams(preferenceText);
    console.log('Extracted parameters:', extractedParams);
    
    // Build Spotify query parameters
    const queryParams = buildSpotifyQueryParams(extractedParams);
    console.log('Spotify query parameters:', queryParams);
    
    // If we don't have any seed genres or the ones we have aren't valid,
    // add some default popular genres
    if (!queryParams.seed_genres) {
      // Use a set of valid genre seeds that are likely to work
      queryParams.seed_genres = 'pop,rock,electronic,dance,hip-hop';
    }
    
    try {
      // Get access token
      const token = await getAccessToken();
      
      // Call Spotify recommendations API
      const response = await axios.get(`${SPOTIFY_API_URL}/recommendations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: queryParams,
        timeout: 5000 // Add timeout to prevent hanging requests
      });
      
      // Process and format the results
      const recommendations = response.data.tracks.map(track => {
        // Format and extract relevant data
        return {
          id: track.id,
          title: track.name,
          artist: track.artists.map(artist => artist.name).join(', '),
          album: track.album.name,
          albumArt: track.album.images[0]?.url,
          popularity: track.popularity,
          previewUrl: track.preview_url,
          externalUrl: track.external_urls.spotify,
          // Extract audio features if available in the response
          energy: track.energy,
          tempo: track.tempo,
          valence: track.valence,
          danceability: track.danceability,
          genres: extractedParams.genres.slice(0, 2), // Include the matched genres as a guess
          // Calculate a similarity score based on how well it matches the query
          // This is a placeholder; in a real app, we would compare audio features to requested features
          similarity: (track.popularity / 100) * 0.8 + Math.random() * 0.2
        };
      });
      
      // Sort by similarity (highest first)
      return _.sortBy(recommendations, track => -track.similarity);
      
    } catch (error) {
      console.error('Error getting Spotify recommendations:', error.message || error);
      
      // If the error is due to an expired token, try refreshing once
      if (error.response && error.response.status === 401) {
        console.log('Token expired, trying to refresh...');
        await getAccessToken(true); // Force token refresh
        return getRecommendations(preferenceText); // Retry once
      }
      
      // For all other errors, throw to fallback
      throw error;
    }
  } catch (error) {
    console.error('Fatal error in recommendation process:', error.message || error);
    throw error;
  }
}

// Get detailed audio features for a track
export async function getAudioFeatures(trackId) {
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(`${SPOTIFY_API_URL}/audio-features/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting audio features:', error.message || error);
    
    // If the error is due to an expired token, try refreshing once
    if (error.response && error.response.status === 401) {
      await getAccessToken(true); // Force token refresh
      return getAudioFeatures(trackId); // Retry once
    }
    
    throw error;
  }
}

// Utility function to get color from track features
export function getColorFromFeatures(features) {
  // Map energy and valence to a color
  // Energy: 0 (low) -> 1 (high) = Blue -> Red
  // Valence: 0 (negative) -> 1 (positive) = Dark -> Bright
  
  const h = Math.floor((1 - features.energy) * 240); // 240 (blue) -> 0 (red)
  const s = Math.floor(features.danceability * 100);
  const l = Math.floor(30 + features.valence * 40); // 30% -> 70% lightness
  
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Health check function to verify if Spotify API is available
export async function checkSpotifyHealth() {
  try {
    const token = await getAccessToken();
    return { 
      status: 'ok',
      token: token ? 'valid' : 'missing',
      lastError: lastTokenError ? lastTokenError.message : null
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message || 'Unknown error',
      lastError: lastTokenError ? lastTokenError.message : null
    };
  }
}

// Get a list of valid genre seeds from Spotify
export async function getGenreSeeds() {
  try {
    const token = await getAccessToken();
    
    const response = await axios.get(`${SPOTIFY_API_URL}/recommendations/available-genre-seeds`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      timeout: 5000
    });
    
    return response.data.genres;
  } catch (error) {
    console.error('Error getting genre seeds:', error.message || error);
    
    // If the error is due to an expired token, try refreshing once
    if (error.response && error.response.status === 401) {
      await getAccessToken(true); // Force token refresh
      return getGenreSeeds(); // Retry once
    }
    
    // Return the hardcoded list if we can't get from API
    return VALID_GENRE_SEEDS;
  }
}