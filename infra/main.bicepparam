// Parameters for infra/main.bicep. Values come from the environment, so the deploy
// workflow and a local `what-if` use exactly the same parameters:
//   IMAGE_TAG        full commit SHA of the image to run
//   AUTH_CLIENT_ID   GitHub variable, set by infra/bootstrap.sh
//   OWNER_OBJECT_ID  GitHub variable, set by infra/bootstrap.sh
using './main.bicep'

param imageTag = readEnvironmentVariable('IMAGE_TAG')
param authClientId = readEnvironmentVariable('AUTH_CLIENT_ID')
param ownerObjectId = readEnvironmentVariable('OWNER_OBJECT_ID')
