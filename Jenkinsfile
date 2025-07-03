// Jenkinsfile for a Fastify Project CI/CD Pipeline

// Define the Node.js version to use (must match a configured NodeJS installation in Jenkins Global Tool Configuration)
def NODEJS_TOOL_NAME = 'nodejs-installer' // IMPORTANT: Change this to the exact name of your configured Node.js tool in Jenkins

// Define environment variables for SonarQube (uncomment and configure if used)
// def SONAR_PROJECT_KEY = 'fastify-api'
// def SONAR_PROJECT_NAME = 'My Fastify API'
// def SONAR_SOURCES = '.'
// def SONAR_EXCLUSIONS = 'node_modules/**, dist/**, build/**, coverage/**'

pipeline {
    // Define the agent where the pipeline will run.
    agent any

    // Define tools to be installed on the agent (e.g., Node.js)
    tools {
        nodejs NODEJS_TOOL_NAME
    }

    environment {
        SLACK_CHANNEL = "#all-rmit-fintech-club-tech-dept"
        // Uncomment and configure these if you prefer to manage them as Pipeline environment variables
        // rather than using global Slack configuration in Jenkins.
        // SNYK_TOKEN = credentials('SNYK_TOKEN')
        // SONAR_TOKEN = credentials('SONAR_TOKEN')
        // SLACK_WEBHOOK_URL = credentials('SLACK_WEBHOOK_URL') // Example if using webhook URL from credentials
    }

    // Stages define the sequential steps of your CI/CD pipeline
    stages {
        // Stage 1: Setup (Original 'Setyo' stage, renamed to 'Setup' for clarity)
        stage('Setup') { // Renamed for better understanding
            steps {
                echo "Building branch: ${env.BRANCH_NAME}"
                echo "Triggered by: ${env.BUILD_USER}, ${env.BUILD_USER_ID}"
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Setup* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Triggered by: ${env.BUILD_USER}_
                        """
                    )
                }
            }
        }

        stage('Checkout') {
            steps {
                script {
                    echo 'Cloning repository...'
                    checkout scm // Checkout the SCM configured for this Jenkins job
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Checkout* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Please check repository access or SCM configuration._
                        """
                    )
                }
            }
        }

        // Stage 2: Install Dependencies
        stage('Install Dependencies') {
            steps {
                script {
                    echo 'Installing Node.js dependencies...'
                    sh 'node --version'
                    sh 'npm --version'
                    sh 'npm ci'
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Install Dependencies* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Dependency installation failed. Check agent Node.js/npm setup or package.json/lock file._
                        """
                    )
                }
            }
        }

        // // Stage 3: Code Validation
        // stage('Code Validation') {
        //     parallel {
        //         stage('Lint') {
        //             steps {
        //                 script {
        //                     echo 'Running lint...'
        //                     sh 'npm run lint' // Uncomment if you have a lint script
        //                 }
        //             }
        //             post {
        //                 failure {
        //                     slackSend(
        //                         channel: env.SLACK_CHANNEL,
        //                         color: 'danger',
        //                         message: """
        //                         :x: *Stage Failed: Lint* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
        //                         _Linting errors detected. Please fix code style issues._
        //                         """
        //                     )
        //                 }
        //             }
        //         }
        //         stage('Build') {
        //             steps {
        //                 script {
        //                     sh 'npm run build'
        //                 }
        //             }
        //             post {
        //                 failure {
        //                     slackSend(
        //                         channel: env.SLACK_CHANNEL,
        //                         color: 'danger',
        //                         message: """
        //                         :x: *Stage Failed: Build* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
        //                         _Project build failed. Check compilation errors._
        //                         """
        //                     )
        //                 }
        //             }
        //         }
        //     }
        // }

        // Stage 4: TypeScript Syntax Check
        stage('TypeScript Syntax Check') {
            steps {
                script {
                    echo 'Checking TypeScript syntax...'
                    sh 'npx tsc --noEmit' // Runs TypeScript compiler in noEmit mode to only check for errors
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: TypeScript Syntax Check* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _TypeScript compilation errors detected. Please fix type/syntax issues._
                        """
                    )
                }
            }
        }

        // Stage 5: Snyk Security Scan
        stage('Snyk Scan') {
            steps {
                script {
                    echo 'Running Snyk security scan...'
                    snykSecurity(
                        snykInstallation: 'snyk-installer', 
                        snykTokenId: 'snyk',          
                        severityThreshold: 'low',
                        failOn: 'all',
                        jsonFileOutput: 'snyk-report.json'
                    )
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Snyk Security Scan* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Snyk found vulnerabilities above threshold. Please review the report._
                        """
                    )
                }
            }
        }

        // Stage 6: SonarQube Analysis (Uncomment and configure if used)
        /*
        stage('SonarQube Analysis') {
            steps {
                script {
                    echo 'Running SonarQube analysis...'
                    withSonarQubeEnv(credentialsId: 'SONAR_TOKEN', installationName: 'My SonarQube') { // IMPORTANT: Replace 'My SonarQube' with your SonarQube server name configured in Jenkins
                        sh "sonar-scanner -Dsonar.projectKey=${SONAR_PROJECT_KEY} " +
                            "-Dsonar.projectName='${SONAR_PROJECT_NAME}' " +
                            "-Dsonar.sources=${SONAR_SOURCES} " +
                            "-Dsonar.exclusions=${SONAR_EXCLUSIONS}"
                    }
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: SonarQube Analysis* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _SonarQube analysis failed. Check quality gate or server connection._
                        """
                    )
                }
            }
        }
        */

        // Stage 7: Run Tests (Uncomment and configure if used)
        /*
        stage('Run Tests') {
            steps {
                script {
                    echo 'Running tests...'
                    sh 'npm test'
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Run Tests* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Tests failed. Please review test results._
                        """
                    )
                }
            }
        }
        */

        // Stage 8: Build/Package (Optional for Fastify) (Uncomment and configure if used)
        /*
        stage('Build/Package') {
            steps {
                script {
                    echo 'Fastify projects typically do not have a "build" step like frontend apps.'
                    echo 'This stage can be used for transpilation (e.g., TypeScript to JavaScript) or packaging.'
                    // Example: If you transpile TypeScript to JavaScript for deployment
                    // sh 'npx tsc'
                    // Or if you create a distributable package:
                    // sh 'npm pack'
                }
            }
            post {
                failure {
                    slackSend(
                        channel: env.SLACK_CHANNEL,
                        color: 'danger',
                        message: """
                        :x: *Stage Failed: Build/Package* - ${env.JOB_NAME} #${env.BUILD_NUMBER} (${env.BUILD_URL})
                        _Build or packaging process failed._
                        """
                    )
                }
            }
        }
        */
    }

    // Post-build actions: Notifications, cleanup, etc.
    post {
        always {
            cleanWs()
            // Optional: Archive any generated reports or build artifacts
            // /*
            // script {
            //     echo 'Archiving build artifacts...'
            //     archiveArtifacts artifacts: 'snyk-report.json, **/*.log, **/*.html', fingerprint: true
            // }
            // */
        }
        success {
            script {
                echo 'Pipeline succeeded! Sending Slack notification.'
                slackSend (
                    channel: env.SLACK_CHANNEL,
                    color: 'good',
                    message: "SUCCESS: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                )
            }
        }
        failure {
            script {
                echo 'Pipeline failed! Sending Slack notification.'
                slackSend (
                    channel: env.SLACK_CHANNEL,
                    color: 'danger',
                    message: "OVERALL FAILED: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                    // You might want to adjust this overall message if stage-level failures are handled
                )
            }
        }
        aborted {
            script {
                echo 'Pipeline aborted! Sending Slack notification.'
                slackSend (
                    channel: env.SLACK_CHANNEL,
                    color: 'warning',
                    message: "ABORTED: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER} (${env.BUILD_URL})",
                )
            }
        }
    }
}