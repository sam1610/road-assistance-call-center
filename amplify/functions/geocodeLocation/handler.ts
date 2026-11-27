import type { Schema } from '../../data/resource';
import { LocationClient, SearchPlaceIndexForTextCommand } from '@aws-sdk/client-location';
import Geohash from 'latlon-geohash';

// Initialize AWS Location Service client
const locationClient = new LocationClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Place Index name - should be set via environment variable
const PLACE_INDEX_NAME = process.env.PLACE_INDEX_NAME || 'RoadAssistPlaceIndex';

// Default fallback: Riyadh city center, Saudi Arabia
const DEFAULT_LOCATION = {
  latitude: 24.7136,
  longitude: 46.6753,
  geohash: 'thev0z',
  address: 'Riyadh, Saudi Arabia (default fallback)',
  confidence: 0
};

export const handler: Schema['geocodeLocation']['functionHandler'] = async (event) => {
  const { address, languageCode } = event.arguments;

  // Validate input
  if (!address || address.trim().length < 3) {
    console.warn('Address too short or empty, returning default location');
    return DEFAULT_LOCATION;
  }

  try {
    console.log(`Geocoding address: "${address}" with language: ${languageCode || 'en'}`);

    // Prepare search command
    const command = new SearchPlaceIndexForTextCommand({
      IndexName: PLACE_INDEX_NAME,
      Text: address,
      Language: languageCode || 'en', // 'en' or 'ar'
      MaxResults: 1,
      // Bias search results toward Saudi Arabia (Riyadh center)
      BiasPosition: [46.6753, 24.7136], // [longitude, latitude]
      FilterCountries: ['SAU'], // Restrict to Saudi Arabia
    });

    // Execute search
    const response = await locationClient.send(command);

    // Check if we got results
    if (!response.Results || response.Results.length === 0) {
      console.warn('No geocoding results found, returning default location');
      return DEFAULT_LOCATION;
    }

    // Extract first result
    const result = response.Results[0];
    const point = result.Place?.Geometry?.Point;

    if (!point || point.length < 2) {
      console.error('Invalid geometry in result:', result);
      return DEFAULT_LOCATION;
    }

    const [longitude, latitude] = point; // AWS Location returns [lon, lat]

    // Generate 6-character geohash
    const geohash = Geohash.encode(latitude, longitude, 6);

    // Extract formatted address
    const formattedAddress = result.Place?.Label || address;

    // Calculate confidence (AWS Location Service uses Relevance score 0-1)
    const confidence = result.Relevance || 0.5;

    console.log(`Geocoding successful: ${formattedAddress} -> ${geohash} (confidence: ${confidence})`);

    return {
      latitude,
      longitude,
      geohash,
      address: formattedAddress,
      confidence
    };

  } catch (error) {
    console.error('Geocoding error:', error);
    
    // If AWS Location Service is not available, try fallback with OpenStreetMap
    try {
      console.log('Attempting OpenStreetMap fallback...');
      return await geocodeWithOSM(address);
    } catch (osmError) {
      console.error('OpenStreetMap fallback failed:', osmError);
      return DEFAULT_LOCATION;
    }
  }
};

/**
 * Fallback geocoding using OpenStreetMap Nominatim
 * Only used if AWS Location Service fails
 */
async function geocodeWithOSM(address: string) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?` +
    `format=json&q=${encodeURIComponent(address)}, Saudi Arabia&limit=1`,
    {
      headers: {
        'User-Agent': 'RoadAssistanceCallCenter/1.0' // Required by Nominatim
      }
    }
  );

  const data = await response.json();

  if (data && Array.isArray(data) && data.length > 0) {
    const { lat, lon, display_name, importance } = data[0];
    const geohash = Geohash.encode(parseFloat(lat), parseFloat(lon), 6);

    return {
      latitude: parseFloat(lat),
      longitude: parseFloat(lon),
      geohash,
      address: display_name,
      confidence: importance || 0.5
    };
  }

  return DEFAULT_LOCATION;
}
