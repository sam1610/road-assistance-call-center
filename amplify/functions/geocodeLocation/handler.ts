import type { Schema } from '../../data/resource';
import { GeoPlacesClient, GeocodeCommand } from '@aws-sdk/client-geo-places';
import Geohash from 'latlon-geohash';

// Initialize AWS Location Service client (new API - no Place Index needed!)
const geoPlacesClient = new GeoPlacesClient({ region: process.env.AWS_REGION || 'us-east-1' });

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

    // Use NEW AWS Location Service API (no Place Index required!)
    const command = new GeocodeCommand({
      QueryText: address,
      Language: languageCode || 'en', // 'en' or 'ar'
      MaxResults: 1,
      // Bias search results toward Saudi Arabia (Riyadh center)
      BiasPosition: [46.6753, 24.7136], // [longitude, latitude]
      Filter: {
        IncludeCountries: ['SAU'], // Restrict to Saudi Arabia
      },
    });

    // Execute search
    const response = await geoPlacesClient.send(command);

    // Check if we got results
    if (!response.ResultItems || response.ResultItems.length === 0) {
      console.warn('No geocoding results found, trying OpenStreetMap fallback');
      return await geocodeWithOSM(address);
    }

    // Extract first result
    const result = response.ResultItems[0];
    const point = result.Position;

    if (!point || point.length < 2) {
      console.error('Invalid geometry in result:', result);
      return await geocodeWithOSM(address);
    }

    const [longitude, latitude] = point; // AWS Location returns [lon, lat]

    // Generate 6-character geohash
    const geohash = Geohash.encode(latitude, longitude, 6);

    // Extract formatted address
    const formattedAddress = result.Title || result.Address?.Label || address;

    // Calculate confidence (new API uses different scoring)
    const confidence = result.MapView ? 0.9 : 0.7;

    console.log(`Geocoding successful: ${formattedAddress} -> ${geohash} (confidence: ${confidence})`);

    return {
      latitude,
      longitude,
      geohash,
      address: formattedAddress,
      confidence
    };

  } catch (error: any) {
    console.error('AWS Location Service error:', error.message || error);
    
    // Fall back to OpenStreetMap if AWS Location fails
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
