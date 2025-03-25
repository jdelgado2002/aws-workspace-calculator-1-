import WorkSpaceCalculator from "@/components/workspace-calculator"

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">AWS WorkSpaces Pricing Calculator</h1>
        <WorkSpaceCalculator />
      </div>
    </main>
  )
}

