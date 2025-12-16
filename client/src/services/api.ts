import axios from "axios"
import Cookies from "js-cookie"

const api = axios.create({
	baseURL: process.env.REACT_APP_BASE_URLDNS || "https://api.consentmd.online/v1",
	headers: {
		"Content-Type": "application/json",
	},
})

api.interceptors.request.use(
	(config) => {
		const token = Cookies.get("accessToken")
		if (token) {
			config.headers["Authorization"] = `Bearer ${token}`
		}
		return config
	},
	(error) => {
		return Promise.reject(error)
	}
)

export default api
