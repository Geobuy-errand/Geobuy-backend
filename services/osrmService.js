const axios = require('axios');

class OSRMService {
  constructor() {
    // Public OSRM instance (free, no API key required)
    this.baseUrl = 'https://router.project-osrm.org';
  }

  /**
   * Get driving distance and duration between two points
   * @param {number} lat1 - Origin latitude
   * @param {number} lon1 - Origin longitude
   * @param {number} lat2 - Destination latitude
   * @param {number} lon2 - Destination longitude
   */
  async getDistance(lat1, lon1, lat2, lon2) {
    try {
      const response = await axios.get(
        `${this.baseUrl}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}`,
        {
          params: {
            overview: 'false',
            steps: 'false',
          },
        }
      );

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No route found between these locations');
      }

      const route = response.data.routes[0];
      
      return {
        distance: {
          value: route.distance / 1609.34, // Convert meters to miles
          text: `${(route.distance / 1609.34).toFixed(1)} miles`,
        },
        duration: {
          value: route.duration / 60, // Convert seconds to minutes
          text: `${Math.round(route.duration / 60)} minutes`,
        },
      };
    } catch (error) {
      console.error('OSRM error:', error.message);
      throw new Error(`Failed to calculate distance: ${error.message}`);
    }
  }

  /**
   * Get distances to multiple destinations (for provider matching)
   * @param {number} originLat - Origin latitude
   * @param {number} originLon - Origin longitude
   * @param {Array} destinations - Array of {lat, lon} objects
   */
  async getBatchDistances(originLat, originLon, destinations) {
    if (!destinations || destinations.length === 0) {
      return [];
    }

    // Format: lon,lat;lon,lat;lon,lat
    const destString = destinations
      .map(d => `${d.lon},${d.lat}`)
      .join(';');
    
    try {
      const response = await axios.get(
        `${this.baseUrl}/table/v1/driving/${originLon},${originLat};${destString}`,
        {
          params: {
            annotations: 'distance,duration',
          },
        }
      );

      if (!response.data.distances || response.data.distances.length === 0) {
        return destinations.map(() => ({ distance: null, duration: null }));
      }

      // The first row is the origin to each destination
      const distances = response.data.distances[0] || [];
      const durations = response.data.durations[0] || [];

      return distances.map((dist, index) => ({
        distance: dist ? dist / 1609.34 : null, // Convert to miles
        duration: durations[index] ? durations[index] / 60 : null, // Convert to minutes
      }));
    } catch (error) {
      console.error('Batch OSRM error:', error.message);
      // Return null distances so we can still proceed with fallback
      return destinations.map(() => ({ distance: null, duration: null }));
    }
  }
}

module.exports = new OSRMService();