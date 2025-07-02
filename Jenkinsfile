// Jenkinsfile for a Fastify Project CI/CD Pipeline

// Define the Node.js version to use (must match a configured NodeJS installation in Jenkins Global Tool Configuration)
def NODEJS_TOOL_NAME = 'nodejs-installer' // IMPORTANT: Change this to the exact name of your configured Node.js tool in Jenkins

// Define environment variables for SonarQube
// SONAR_PROJECT_KEY: Unique key for your project in SonarQube. Recommended to be unique per project.
// SONAR_PROJECT_NAME: Display name for your project in SonarQube.
// SONAR_SOURCES: Directories to scan (e.g., 'src', '.' for the whole project).
// SONAR_EXCLUSIONS: Files/directories to exclude from SonarQube scan (e.g., build artifacts, node_modules).
// def SONAR_PROJECT_KEY = 'fastify-api'
// def SONAR_PROJECT_NAME = 'My Fastify API'
// def SONAR_SOURCES = '.' // Scan the entire project directory
// def SONAR_EXCLUSIONS = 'node_modules/**, dist/**, build/**, coverage/**'

pipeline {
    // Define the agent where the pipeline will run.
    // 'label' specifies a Jenkins agent label. Ensure your agent has Node.js and npm/yarn installed.
    // 'retries 1' makes the stage retry once if a non-resumable step fails due to a Jenkins restart.
    agent any

    // Define tools to be installed on the agent (e.g., Node.js)
    tools {
        nodejs NODEJS_TOOL_NAME
    }

    // Define environment variables for the pipeline.
    // Credentials are retrieved using the `credentials()` helper and their IDs.
    // environment {
    //     SNYK_TOKEN = credentials('SNYK_TOKEN')         // Snyk API token from Jenkins Credentials
    //     SONAR_TOKEN = credentials('SONAR_TOKEN')       // SonarQube token from Jenkins Credentials
    //     SLACK_WEBHOOK_URL = credentials('SLACK_WEBHOOK_URL') // Slack Webhook URL from Jenkins Credentials
    // }

    // Stages define the sequential steps of your CI/CD pipeline
    stages {
        // Stage 1: Checkout Code
        // This stage fetches the latest code from your GitHub repository.
        // It automatically uses the Git SCM configuration (including credentials) defined in the Jenkins job.
        stage('Checkout') {
            steps {
                script {
                    echo 'Cloning repository...'
                    checkout scm // Checkout the SCM configured for this Jenkins job
                }
            }
        }

        // Stage 2: Install Dependencies
        // Installs all Node.js project dependencies using npm.
        // `npm ci` is preferred in CI environments for clean and consistent installs based on package-lock.json.
        stage('Install Dependencies') {
            steps {
                script {
                    echo 'Installing Node.js dependencies...'
                    sh 'node --version'
                    sh 'npm --version'
                    sh 'npm ci' 
                    // Use npm ci for clean and consistent installs
                    // Alternative for Yarn users: sh 'yarn install --frozen-lockfile'
                }
            }
        }

        // Stage 3: Code Validation
        stage('Code Validation') {
            parallel {
                stage('Lint') {
                    steps {
                        script {
                            // sh 'npm run lint'
                            echo 'Run lint'
                        }
                    }
                }
                stage('Build') {
                    steps {
                        script {
                            sh 'npm run build'
                        }
                    }
                }
            }
        }

        // Stage 4: TypeScript Syntax Check
        // Checks for TypeScript compilation errors without emitting JavaScript files.
        // Ensures type safety and syntax correctness.
        stage('TypeScript Syntax Check') {
            steps {
                script {
                    echo 'Checking TypeScript syntax...'
                    sh 'npx tsc --noEmit' // Runs TypeScript compiler in noEmit mode to only check for errors
                }
            }
        }

        // Stage 5: Snyk Security Scan
        // Scans project dependencies and code for known vulnerabilities using Snyk.
        // `snykSecurity` is a step provided by the Snyk Security Plugin for Jenkins.
        // stage('Snyk Scan') {
        //     steps {
        //         script {
        //             echo 'Running Snyk security scan...'
        //             snykSecurity(
        //                 snykInstallation: 'snyk-installer', // IMPORTANT: Replace with the name of your Snyk CLI installation in Jenkins
        //                 snykTokenId: 'snyk',               // IMPORTANT: Replace with the ID of your Snyk API token credential in Jenkins
        //                 targetFile: 'package.json',        // Specify the manifest file for Snyk to scan
        //                 severityThreshold: 'low',          // Fail if any vulnerability (low, medium, high) is found
        //                 failOn: 'all',                     // Fail the build if any vulnerability is found
        //                 jsonFileOutput: 'snyk-report.json' // Save the Snyk report to a JSON file
        //             )
        //             // Optional: Run snyk monitor to continuously monitor your project in Snyk
        //             // sh "snyk monitor --json-file-output=snyk-monitor-report.json"
        //         }
        //     }
        // }

        // Stage 6: SonarQube Analysis
        // Performs static code analysis using SonarQube to detect bugs, vulnerabilities, and code smells.
        // `withSonarQubeEnv` is provided by the SonarQube Scanner for Jenkins plugin.
        // stage('SonarQube Analysis') {
        //     steps {
        //         script {
        //             echo 'Running SonarQube analysis...'
        //             withSonarQubeEnv(credentialsId: 'SONAR_TOKEN', installationName: 'My SonarQube') { // IMPORTANT: Replace 'My SonarQube' with your SonarQube server name configured in Jenkins
        //                 sh "sonar-scanner -Dsonar.projectKey=${SONAR_PROJECT_KEY} " +
        //                    "-Dsonar.projectName='${SONAR_PROJECT_NAME}' " +
        //                    "-Dsonar.sources=${SONAR_SOURCES} " +
        //                    "-Dsonar.exclusions=${SONAR_EXCLUSIONS}"
        //             }
        //         }
        //     }
        // }

        // Stage 7: Run Tests
        // Executes your project's tests. It's crucial for verifying code correctness.
        // Assumes you have a test script defined in your package.json (e.g., "test": "jest" or "test": "node --test").
        // stage('Run Tests') {
        //     steps {
        //         script {
        //             echo 'Running tests...'
        //             sh 'npm test' // Runs the 'test' script defined in package.json
        //             // Alternative for Yarn users: sh 'yarn test'
        //         }
        //     }
        // }

        // Stage 8: Build/Package (Optional for Fastify)
        // Fastify projects are typically JavaScript/TypeScript codebases that are run directly.
        // This stage can be used if you have a transpilation step (e.g., TypeScript to JavaScript)
        // or if you need to create a distributable package.
    //     stage('Build/Package') {
    //         steps {
    //             script {
    //                 echo 'Fastify projects typically do not have a "build" step like frontend apps.'
    //                 echo 'This stage can be used for transpilation (e.g., TypeScript to JavaScript) or packaging.'
    //                 // Example: If you transpile TypeScript to JavaScript for deployment
    //                 // sh 'npx tsc'
    //                 // Or if you create a distributable package:
    //                 // sh 'npm pack'
    //             }
    //         }
    //     }
    }

    // Post-build actions: Notifications, cleanup, etc.
    // These blocks execute after all stages have completed, regardless of their success or failure.
    post {
        // 'always' block executes regardless of the pipeline's final status.
        always {
            cleanWs()
            // script {
            //     echo 'Archiving build artifacts...'
            //     // Archive any generated reports or build artifacts for later inspection.
            //     archiveArtifacts artifacts: 'snyk-report.json, **/*.log, **/*.html', fingerprint: true
            // }
        }
        // 'success' block executes only if the pipeline completes successfully.
        success {
            script {
                echo 'Pipeline succeeded! Sending Slack notification.'
                slackSend (
                    color: 'good', // Green color for success
                    message: "SUCCESS: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                )
            }
        }
        // 'failure' block executes only if the pipeline fails.
        failure {
            script {
                echo 'Pipeline failed! Sending Slack notification.'
                slackSend (
                    color: 'danger', // Red color for failure
                    message: "FAILED: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                )
            }
        }
        // 'aborted' block executes if the pipeline is manually stopped/aborted.
        aborted {
            script {
                echo 'Pipeline aborted! Sending Slack notification.'
                slackSend (
                    color: 'warning', // Yellow color for warning/aborted
                    message: "ABORTED: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                )
            }
        }
    }
}
