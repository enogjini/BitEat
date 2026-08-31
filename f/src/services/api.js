/**
 * API Configuration and Service Layer
 * Handles all backend API communication
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// API endpoints
export const API_ENDPOINTS = {
  health: `${API_URL}/health`,
  users: `${API_URL}/users`,
  // Add more endpoints as needed
};

// HTTP client with error handling
const apiClient = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    headers = {},
    ...otherOptions
  } = options;

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
      ...otherOptions,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `HTTP Error: ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

// API Service Methods
export const apiService = {
  // Health check
  health: async () => {
    return apiClient(API_ENDPOINTS.health);
  },

  // Users
  getUsers: async () => {
    return apiClient(API_ENDPOINTS.users);
  },

  // Add more API methods as needed
};

export default apiService;
