const axios = require('axios');

class NominatimService {
  constructor() {
    this.baseUrl = 'https://nominatim.openstreetmap.org';
  }

  /**
   * Clean and format address for geocoding
   */
  formatAddressForGeocoding(address) {
    if (!address) return '';
    
    let formatted = address
      .replace(/[^\w\s,.'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // If address is too long, extract key parts
    if (formatted.length > 100) {
      const parts = formatted.split(',');
      if (parts.length >= 3) {
        const street = parts[0].trim();
        const postcode = parts[parts.length - 2]?.trim() || parts[parts.length - 1].trim();
        const city = parts[1]?.trim() || parts[parts.length - 3]?.trim();
        formatted = `${street}, ${city}, ${postcode}`;
      }
    }
    
    return formatted;
  }

  /**
   * Extract UK postcode from address
   */
  extractPostcode(address) {
    if (!address) return null;
    const postcodeRegex = /([A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2})/i;
    const match = address.match(postcodeRegex);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Geocode address with multiple fallback strategies
   */
  async geocodeAddress(address, retryCount = 0) {
    try {
      // Strategy 1: Full address
      let formattedAddress = this.formatAddressForGeocoding(address);
      
      let response = await this.makeGeocodeRequest(formattedAddress);
      
      // Strategy 2: Just postcode
      if (response.data.length === 0) {
        const postcode = this.extractPostcode(address);
        if (postcode) {
          response = await this.makeGeocodeRequest(postcode);
        }
      }
      
      // Strategy 3: City + Postcode
      if (response.data.length === 0) {
        const parts = address.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const cityParts = parts.slice(-3).join(', ');
          response = await this.makeGeocodeRequest(cityParts);
        }
      }
      
      // Strategy 4: Street + City
      if (response.data.length === 0) {
        const parts = address.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const streetCity = `${parts[0]}, ${parts[1]}`;
          response = await this.makeGeocodeRequest(streetCity);
        }
      }
      
      // Strategy 5: Postcode + UK
      if (response.data.length === 0) {
        const postcode = this.extractPostcode(address);
        if (postcode) {
          response = await this.makeGeocodeRequest(`${postcode}, UK`);
        }
      }
      
      if (response.data.length === 0) {
        throw new Error(`Address not found: ${address}`);
      }
      
      const result = response.data[0];
      
      const isUK = result.display_name?.includes('United Kingdom') ||
                   result.display_name?.includes('UK') ||
                   result.address?.country_code === 'gb';
      
      if (!isUK) {
        throw new Error('Address must be in the United Kingdom');
      }
      
      return {
        valid: true,
        lat: parseFloat(result.lat),
        lon: parseFloat(result.lon),
        displayName: result.display_name,
        importance: result.importance || 0,
        address: result.address || {},
        quality: result.importance > 0.3 ? 'high' : 'medium',
      };
      
    } catch (error) {
      console.error('Geocoding error:', error.message);
      
      if (retryCount < 2) {
        const postcode = this.extractPostcode(address);
        if (postcode) {
          return this.geocodeAddress(postcode, retryCount + 1);
        }
      }
      
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Make geocoding request to Nominatim
   */
  async makeGeocodeRequest(query) {
    return await axios.get(`${this.baseUrl}/search`, {
      params: {
        q: query,
        format: 'json',
        limit: 5,
        countrycodes: 'gb',
        addressdetails: 1,
        dedupe: 1,
      },
      headers: {
        'User-Agent': 'GEOBUY-Errands/1.0',
      },
      timeout: 10000,
    });
  }

  /**
   * Validate a UK address
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
      const response = await axios.get(`${this.baseUrl}/search`, {
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
      });

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