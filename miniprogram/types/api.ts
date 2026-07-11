export interface ApiResponse<T> {
  success: boolean;
  errorCode?: string;
  message?: string;
  data?: T;
  requestId?: string;
}

export interface RequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: string | Record<string, unknown> | ArrayBuffer;
}
