Great progress! Here’s a clear and professional `instructions.md` file tailored to your AWS WorkSpaces Pricing Calculator app. It walks users through setup, credentials, and running locally or on Vercel.

---

```markdown
# 🧮 AWS WorkSpaces Pricing Calculator — Instructions

This app lets users estimate monthly and annual costs for Amazon WorkSpaces configurations. It pulls live AWS pricing and bundle metadata when available, with fallbacks for manual calculations.

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/aws-workspace-calculator.git
cd aws-workspace-calculator
```

### 2. Install Dependencies

> You must have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

```bash
pnpm install
```

---

## 🔐 Environment Setup

### 3. Create a `.env.local` File

```env
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN=YOUR_SESSION_TOKEN  # only needed for temporary/SSO credentials
```

> The AWS credentials must have permission to access:
>
> - `workspaces:DescribeWorkspaceBundles`
> - `workspaces:DescribeWorkspaces`
> - `ec2:DescribeRegions`
> - `pricing:GetProducts`
> - `workspaces:Describe*`,
> - `workspaces:List*`,
> - `appstream:Describe*`,
> - `appstream:List*`,
> - `ce:GetCostAndUsage`,
> - `ce:GetCostForecast`,
> - `ce:GetUsageForecast`,
> - `ce:GetRightsizingRecommendation`,
> - `ce:GetReservationPurchaseRecommendation`,
> - `ce:GetDimensionValues`,
> - `ce:GetCostCategories`,
> - `pricing:GetProducts`,
> - `pricing:DescribeServices`,
> - `ec2:DescribeRegions`

For SSO-based credentials, run:

```bash
aws configure export-credentials --profile <your-sso-profile>
```

And paste the resulting values into `.env.local`.

---

## 🧪 Running the App Locally

```bash
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000)

---

## ☁️ Deployment (Vercel)

### 4. Set Environment Variables

In your [Vercel Dashboard](https://vercel.com/):

- `AWS_REGION` = `us-west-2`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` from your exported credentials

> Note: `AWS_SESSION_TOKEN` is required if using temporary credentials (e.g., from AWS SSO)

### 5. Deploy

```bash
vercel deploy --prod
```

---

## 🛠 Common Issues

### ❌ "InvalidSignatureException"  
✅ Ensure you're using the correct region and that `AWS_SESSION_TOKEN` is present if credentials are temporary.

### ❌ "ENOTFOUND workspaces.us-east-2.amazonaws.com"  
✅ Change `AWS_REGION` to a region that supports WorkSpaces (e.g., `us-west-2` or `us-east-1`).

### ❌ "AccessDenied"  
✅ Attach a policy to your IAM role or user that includes:
```json
{
  "Effect": "Allow",
  "Action": [
    "workspaces:Describe*",
    "pricing:GetProducts",
    "ec2:DescribeRegions"
  ],
  "Resource": "*"
}
```

---

## 📦 Project Structure

```
app/
  api/                # AWS API routes
  components/         # UI components
  styles/             # Tailwind config
  page.tsx            # Main UI

lib/
  aws-config.ts       # AWS SDK client setup
  aws-error-handler.ts
  utils.ts
```

---

## ✅ Status

- ✅ Supports live AWS pricing from Pricing API
- ✅ Uses WorkSpaces API to fetch real bundle specs
- ✅ Fully serverless, deployable to Vercel
- ✅ Fallback pricing for offline use

---

## 🧠 Questions?

Ping the project maintainer or open an issue in the repo.
```

---

Let me know if you'd like to include screenshots, example API calls, or CLI testing steps in an appendix.