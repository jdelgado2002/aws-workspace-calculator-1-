# AWS Integration Guide

This document provides detailed information about how the AWS WorkSpaces Pricing Calculator integrates with AWS services.

## Required AWS Permissions

The AWS credentials used by this application need the following permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeRegions",
        "workspaces:DescribeWorkspaceBundles",
        "workspaces:DescribeWorkspaces",
        "pricing:GetProducts"
      ],
      "Resource": "*"
    }
  ]
}

