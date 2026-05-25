import axios, { AxiosInstance } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

const request: AxiosInstance = axios.create({
  baseURL: 'https://www.kaoiki.com:3333/api/v1',
  timeout: 600000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  },
});

// ✅ 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token') ? localStorage.getItem('token') : '';
    if (token) {
      // 注意：headers 可能是只读类型，需要使用类型断言
      (config.headers as any)['token'] = token;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ✅ 响应拦截器
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

export default request;
