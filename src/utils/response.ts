import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  timestamp: string;
}

export const successResponse = <T>(
  res: Response,
  data: T,
  message: string = 'Operation successful',
  statusCode: number = 200
): Response<ApiResponse<T>> => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

export const paginatedResponse = <T>(
  res: Response,
  data: T,
  page: number,
  pageSize: number,
  total: number,
  message: string = 'Operation successful'
): Response<ApiResponse<T>> => {
  const totalPages = Math.ceil(total / pageSize);
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    timestamp: new Date().toISOString(),
  });
};

export const successResponseWithMessage = (
  res: Response,
  message: string,
  statusCode: number = 200
): Response<ApiResponse> => {
  return res.status(statusCode).json({
    success: true,
    message,
    timestamp: new Date().toISOString(),
  });
};
