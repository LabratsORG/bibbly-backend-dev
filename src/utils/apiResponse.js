/**
 * Standardized API Response Utility
 */

class ApiResponse {
  /**
   * Success response
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Created response (201)
   */
  static created(res, data = null, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }

  /**
   * Error response
   */
  static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Bad request (400)
   */
  static badRequest(res, message = 'Bad request', errors = null) {
    return this.error(res, message, 400, errors);
  }

  /**
   * Unauthorized (401)
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  /**
   * Forbidden (403)
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403);
  }

  /**
   * Not found (404)
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Conflict (409)
   */
  static conflict(res, message = 'Resource already exists') {
    return this.error(res, message, 409);
  }

  /**
   * Too many requests (429)
   */
  static tooManyRequests(res, message = 'Too many requests', data = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (data) {
      response.data = data;
    }

    return res.status(429).json(response);
  }

  /**
   * Payment required (402)
   * Used when a payment is needed to continue an action
   */
  static paymentRequired(res, data = null) {
    const response = {
      success: false,
      message: data?.message || 'Payment required to continue',
      code: 'PAYMENT_REQUIRED',
      timestamp: new Date().toISOString()
    };

    if (data) {
      response.data = data;
    }

    return res.status(402).json(response);
  }

  /**
   * Paginated response
   */
  static paginated(res, data, pagination, message = 'Success') {
    const paginationObj = {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNextPage: pagination.page * pagination.limit < pagination.total,
      hasPrevPage: pagination.page > 1
    };

    // Include any additional pagination fields (like unreadCount)
    if (pagination.unreadCount !== undefined) {
      paginationObj.unreadCount = pagination.unreadCount;
    }

    return res.status(200).json({
      success: true,
      message,
      data: {
        data: data,
        pagination: paginationObj
      },
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = ApiResponse;

