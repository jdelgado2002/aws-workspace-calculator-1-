/**
 * Handles AWS SDK errors and provides a more user-friendly error message
 */
export function handleAwsError(error: any): string {
  // Check if it's an AWS SDK error
  if (error.name && error.name.includes("AWS")) {
    switch (error.name) {
      case "AccessDeniedException":
      case "UnauthorizedException":
        return "Access denied. Please check your AWS credentials and permissions."
      case "ResourceNotFoundException":
        return "The requested AWS resource was not found."
      case "ThrottlingException":
        return "AWS request rate limit exceeded. Please try again later."
      case "ValidationException":
        return `AWS validation error: ${error.message}`
      case "ServiceUnavailableException":
        return "AWS service is currently unavailable. Please try again later."
      default:
        return `AWS error: ${error.message}`
    }
  }

  // Handle network or other errors
  if (error.message && error.message.includes("fetch")) {
    return "Network error. Please check your internet connection."
  }

  // Default error message
  return error.message || "An unknown error occurred"
}

