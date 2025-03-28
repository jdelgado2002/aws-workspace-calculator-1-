using AwsWorkspacePricingApi.Services;
using AwsWorkspacePricingApi.Middleware;
using Amazon.Pricing;
using Amazon;
using Amazon.Runtime;
using System.Net.Http.Headers;

var builder = WebApplication.CreateBuilder(args);

// Configure Kestrel explicitly to listen on the specific port
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenAnyIP(5050);
});

// Add services to the container
builder.Services.AddControllers();

// Configure HttpClient for AWS Pricing API
builder.Services.AddHttpClient("AwsPricing", client =>
{
    client.DefaultRequestHeaders.Add("User-Agent", "AWS-Calculator-Client/1.0");
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
    client.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("gzip"));
    client.DefaultRequestHeaders.AcceptEncoding.Add(new StringWithQualityHeaderValue("deflate"));
    client.DefaultRequestHeaders.Add("Referer", "https://calculator.aws/");
    client.DefaultRequestHeaders.Add("Origin", "https://calculator.aws");
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Always use AnonymousAWSCredentials for public pricing API endpoints
var awsCredentials = new AnonymousAWSCredentials();
builder.Services.AddSingleton<IAmazonPricing>(sp => new AmazonPricingClient(
    awsCredentials,
    new AmazonPricingConfig
    {
        RegionEndpoint = RegionEndpoint.USEast1,
        ServiceURL = "https://api.pricing.us-east-1.amazonaws.com"
    }
));

// Register services
builder.Services.AddScoped<WorkspacePricingService>();
builder.Services.AddScoped<AwsWorkspacePricingApi.Utilities.PricingDataFetcher>();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configure CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowedOrigins",
        policy => policy
            .WithOrigins(
                "http://localhost:3000",
                "https://aws-workspace-calculator.example.com"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
    );
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "AWS Workspace Pricing API v1");
        c.RoutePrefix = string.Empty;
    });
    Console.WriteLine("Running in Development mode on http://localhost:5050");
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

// Use error handling middleware
app.UseMiddleware<ErrorHandlingMiddleware>();

// Add CORS before routing
app.UseCors("AllowedOrigins");

// Add middleware in the correct order
app.UseRouting();
app.UseAuthorization();
app.MapControllers();

// Add a basic root endpoint that redirects to Swagger
app.MapGet("/", () => Results.Redirect("/swagger"));

app.Run();
