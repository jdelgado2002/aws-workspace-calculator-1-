using Microsoft.AspNetCore.Mvc;
using AwsWorkspacePricingApi.Models;
using AwsWorkspacePricingApi.Services;

namespace AwsWorkspacePricingApi.Controllers
{
    [ApiController]
    [Route("api/pricing")] // Ensure this matches the expected route
    public class WorkspacePricingController : ControllerBase
    {
        private readonly ILogger<WorkspacePricingController> _logger;
        private readonly WorkspacePricingService _pricingService;

        public WorkspacePricingController(
            ILogger<WorkspacePricingController> logger,
            WorkspacePricingService pricingService)
        {
            _logger = logger;
            _pricingService = pricingService;
        }

        [HttpPost("calculate")]
        public async Task<ActionResult<WorkspaceCalculationResponse>> CalculateWorkspacePricing(
            [FromBody] WorkspaceCalculationRequest request)
        {
            try
            {
                _logger.LogInformation("Received pricing calculation request");

                if (request == null)
                {
                    return BadRequest("Invalid request body");
                }

                // Log key request parameters for debugging
                _logger.LogInformation($"Calculating pricing for {request.NumberOfWorkspaces} workspaces " +
                                       $"with bundle '{request.BundleId}' in region '{request.Region}'");

                var result = await _pricingService.CalculatePricing(request);
                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing workspace pricing calculation");
                return StatusCode(500, new { error = "An error occurred while calculating pricing" });
            }
        }
    }
}
