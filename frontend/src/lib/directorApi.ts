import api from './api'

// Wraps the base axios instance with the director PIN header.
// PIN is stored in localStorage after the director logs in.
function pin() {
  return localStorage.getItem('director_pin') || ''
}

function headers() {
  return { 'X-Director-Pin': pin() }
}

const directorApi = {
  get:    (url: string)                 => api.get(url,        { headers: headers() }),
  post:   (url: string, data?: unknown) => api.post(url, data, { headers: headers() }),
  put:    (url: string, data?: unknown) => api.put(url, data,  { headers: headers() }),
  patch:  (url: string, data?: unknown) => api.patch(url, data, { headers: headers() }),
  delete: (url: string)                 => api.delete(url,     { headers: headers() }),
}

export default directorApi
