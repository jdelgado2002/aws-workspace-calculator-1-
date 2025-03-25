import { NextResponse } from "next/server"
import { DescribeWorkspacesCommand } from "@aws-sdk/client-workspaces"
import { workspacesClient, executeAwsCommand } from "@/lib/aws-config"

export async function GET() {
  try {
    // Fetch user's current WorkSpaces
    let workspaces = []
    try {
      const workspacesResponse = await executeAwsCommand(
        workspacesClient.send(new DescribeWorkspacesCommand({})),
        "Failed to fetch current workspaces",
      )

      workspaces =
        workspacesResponse.Workspaces?.map((workspace) => {
          return {
            id: workspace.WorkspaceId,
            username: workspace.UserName,
            state: workspace.State,
            bundleId: workspace.BundleId,
            directoryId: workspace.DirectoryId,
            computeTypeName: workspace.ComputeTypeName,
            rootVolumeSizeGib: workspace.RootVolumeSizeGib,
            userVolumeSizeGib: workspace.UserVolumeSizeGib,
            runningMode: workspace.WorkspaceProperties?.RunningMode,
          }
        }) || []
    } catch (error) {
      console.error("Error fetching current workspaces:", error)
      // Return an empty array if the API call fails
      workspaces = []
    }

    return NextResponse.json(workspaces)
  } catch (error) {
    console.error("Error fetching current workspaces:", error)
    return NextResponse.json({ error: "Failed to fetch current workspaces" }, { status: 500 })
  }
}

