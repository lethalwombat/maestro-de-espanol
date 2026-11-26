// Every Azure resource the app uses, in one resource group. Deployed by
// .github/workflows/deploy.yml with infra/main.bicepparam; see docs/deployment.md.
// Redeploying with the same parameters must be a no-op (`az deployment group what-if`).

@description('Azure region for every resource.')
param location string = 'eastus'

@description('Image tag to run: the full git commit SHA the image was built from.')
@minLength(7)
param imageTag string

@description('Container image repository (public, so no registry credentials are needed).')
param imageRepository string = 'ghcr.io/lethalwombat/maestro-de-espanol'

@description('Application (client) ID of the Entra app registration used for sign-in.')
param authClientId string

@description('Object ID of the only user allowed in (the owner), checked on top of Entra app assignment.')
param ownerObjectId string

@description('Daily ingestion cap for Log Analytics, in GB.')
param logDailyCapGb string = '0.1'

var appName = 'maestro-de-espanol'
// Must match EXPOSE and PORT in the Dockerfile.
var appPort = 3000

resource logs 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: 'log-${appName}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(logDailyCapGb)
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: 'cae-${appName}'
  location: location
  properties: {
    // Logs go to the workspace through the diagnostic setting below, which names it by
    // resource id. (The 'log-analytics' destination needs the workspace's customerId via
    // reference(), which what-if can't resolve, so every redeploy would show a change.)
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
    // Consumption only: no dedicated workload profiles, so no fixed cost.
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
    zoneRedundant: false
    // Server defaults, stated so what-if reports no changes on a redeploy.
    publicNetworkAccess: 'Enabled'
    peerAuthentication: {
      mtls: {
        enabled: false
      }
    }
    peerTrafficConfiguration: {
      encryption: {
        enabled: false
      }
    }
  }
}

// Console and system logs go to the workspace; the rest stay off. Azure stores every
// category the environment offers, in this order, so all are listed for a clean what-if.
// If Azure adds a category, what-if will show it: add it here, disabled.
var logCategories = [
  { name: 'ContainerAppConsoleLogs', enabled: true }
  { name: 'ContainerAppSystemLogs', enabled: true }
  { name: 'ContainerAppHTTPLogs', enabled: false }
  { name: 'AppEnvSpringAppConsoleLogs', enabled: false }
  { name: 'AppEnvSessionConsoleLogs', enabled: false }
  { name: 'AppEnvSessionPoolEventLogs', enabled: false }
  { name: 'AppEnvSessionLifeCycleLogs', enabled: false }
]
var noRetentionPolicy = {
  days: 0
  enabled: false
}

resource environmentLogs 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: environment
  name: 'to-log-analytics'
  properties: {
    workspaceId: logs.id
    logs: [
      for category in logCategories: {
        category: category.name
        enabled: category.enabled
        retentionPolicy: noRetentionPolicy
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: false
        retentionPolicy: noRetentionPolicy
      }
    ]
  }
}

resource app 'Microsoft.App/containerApps@2026-01-01' = {
  name: appName
  location: location
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      maxInactiveRevisions: 100 // server default, stated for a clean what-if
      ingress: {
        external: true
        targetPort: appPort
        exposedPort: 0 // server default, stated for a clean what-if
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: '${imageRepository}:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          // In the order Azure stores them (Liveness, Readiness, Startup), so what-if matches.
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: appPort
              }
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: appPort
              }
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: appPort
              }
              periodSeconds: 2
              failureThreshold: 30
            }
          ]
        }
      ]
      // Personal use: scale to zero when idle, never beyond one replica.
      scale: {
        minReplicas: 0
        maxReplicas: 1
        // Server defaults (seconds), stated for a clean what-if.
        cooldownPeriod: 300
        pollingInterval: 30
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '10'
              }
            }
          }
        ]
      }
    }
  }
}

// Built-in authentication (Easy Auth) with Microsoft Entra ID. No client secret:
// sign-in uses the ID-token flow. Only the owner gets in: the app registration
// requires assignment (infra/bootstrap.sh), and allowedPrincipals checks the user here too.
resource auth 'Microsoft.App/containerApps/authConfigs@2026-01-01' = {
  parent: app
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      // The deploy workflow and the platform probes check health without signing in.
      excludedPaths: [
        '/api/health'
      ]
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        isAutoProvisioned: false // server default, stated for a clean what-if
        registration: {
          clientId: authClientId
          openIdIssuer: '${az.environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: {
          defaultAuthorizationPolicy: {
            allowedPrincipals: {
              identities: [
                ownerObjectId
              ]
            }
          }
        }
      }
    }
    httpSettings: {
      requireHttps: true
    }
  }
}

output url string = 'https://${app.properties.configuration.ingress.fqdn}'
output appName string = app.name
