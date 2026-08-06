const axios = require('axios');

class NominatimService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org';
  }

  /**
   * Geocode an address to coordinates
   * Checks that the address exists and returns UK coordinates
   */
  async geocodeAddress(address) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/search`,
        {
          params: {
            q: address,
            format: 'json',
            limit: 1,
            countrycodes: 'gb', // Restrict to UK
            addressdetails: 1,
          },
          headers: {
            'User-Agent': 'GEOBUY-Errands/1.0', // Required by Nominatim policy
          },
          timeout: 10000,
        }
      );

      if (response.data.length === 0) {
        return {
          valid: false,
          error: 'Address not found in the UK',
        };
      }

      const result = response.data[0];
      
      // Check if address is in UK
      const isUK = result.display_name?.includes('United Kingdom') ||
                   result.display_name?.includes('UK') ||
                   result.address?.country_code === 'gb';

      if (!isUK) {
        return {
          valid: false,
          error: 'Address is not in the United Kingdom',
        };
      }

      return {
        valid: true,
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        displayName: result.display_name,
        importance: result.importance || 0,
        address: result.address || {},
        // Ensure we have a reasonable quality match
        quality: result.importance > 0.3 ? 'high' : 'medium',
      };
    } catch (error) {
      console.error('Nominatim error:', error.message);
      return {
        valid: false,
        error: 'Geocoding service temporarily unavailable. Please try again.',
      };
    }
  }

  /**
   * Validate a UK address (check if it exists in the UK)
   */
  async validateUKAddress(address) {
    if (!address || address.trim().length < 3) {
      return {
        isValid: false,
        error: 'Please enter a complete address',
      };
    }

    const result = await this.geocodeAddress(address);
    
    return {
      isValid: result.valid,
      ...(result.valid ? {
        coordinates: {
          lat: result.lat,
          lon: result.lon,
        },
        formattedAddress: result.displayName,
        quality: result.quality,
        address: result.address,
      } : {
        error: result.error,
        suggestion: 'Try including the street number, street name, town, and postcode',
      }),
    };
  }

  /**
   * Search for address suggestions (autocomplete)
   */
  async suggestAddresses(query, limit = 5) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/search`,
        {
          params: {
            q: query,
            format: 'json',
            limit: limit,
            countrycodes: 'gb',
            addressdetails: 1,
          },
          headers: {
            'User-Agent': 'GEOBUY-Errands/1.0',
          },
          timeout: 5000,
        }
      );

      return response.data.map(result => ({
        displayName: result.display_name,
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        address: result.address,
        importance: result.importance,
      }));
    } catch (error) {
      console.error('Address suggestion error:', error.message);
      return [];
    }
  }
}

module.exports = new NominatimService();