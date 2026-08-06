// backend/services/distanceService.js
const axios = require('axios');

class DistanceService {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  }

  /**
   * Calculate distance between two addresses
   * @param {string} origin - Origin address
   * @param {string} destination - Destination address  
   * @param {string} mode - Travel mode (driving, walking, bicycling, transit)
   * @param {string} units - imperial or metric
   */
  async getDistance(origin, destination, mode = 'driving', units = 'imperial') {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          origins: origin,
          destinations: destination,
          mode: mode,
          units: units,
          key: this.apiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Distance Matrix API error: ${response.data.status}`);
      }

      const element = response.data.rows[0].elements[0];
      
      if (element.status !== 'OK') {
        throw new Error(`No route found: ${element.status}`);
      }

      return {
        distance: {
          value: element.distance.value / 1609.34, // Convert meters to miles
          text: element.distance.text,
        },
        duration: {
          value: element.duration.value / 60, // Convert seconds to minutes
          text: element.duration.text,
        },
        originAddress: response.data.originAddresses[0],
        destinationAddress: response.data.destinationAddresses[0],
      };
    } catch (error) {
      console.error('Distance calculation error:', error);
      throw error;
    }
  }

  /**
   * Batch calculate distances (for provider matching)
   */
  async getBatchDistances(origin, destinations, mode = 'driving') {
    try {
      const response = await axios.get(this.baseUrl, {
        params: {
          origins: origin,
          destinations: destinations.join('|'),
          mode: mode,
          units: 'imperial',
          key: this.apiKey,
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Distance Matrix API error: ${response.data.status}`);
      }

      const results = response.data.rows[0].elements.map((element, index) => ({
        destinationAddress: response.data.destinationAddresses[index],
        distance: element.status === 'OK' ? {
          value: element.distance.value / 1609.34,
          text: element.distance.text,
        } : null,
        duration: element.status === 'OK' ? {
          value: element.duration.value / 60,
          text: element.duration.text,
        } : null,
        status: element.status,
      }));

      return results;
    } catch (error) {
      console.error('Batch distance calculation error:', error);
      throw error;
    }
  }
}

module.exports = new DistanceService();