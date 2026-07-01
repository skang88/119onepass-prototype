pipeline {
    agent any

    environment {
        // 이미지 및 컨테이너 이름 정의
        BACKEND_IMAGE      = "express-backend:latest"
        FRONTEND_IMAGE     = "react-frontend:latest"
        BACKEND_CONTAINER  = "express-backend"
        FRONTEND_CONTAINER = "react-frontend"
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Git으로부터 코드를 가져옵니다...'
                // Jenkins 파이프라인 프로젝트 설정에서 SCM을 지정하면 자동으로 Checkout됩니다.
            }
        }

        stage('Build Backend') {
            steps {
                echo 'Express 백엔드 Docker 이미지 빌드 중...'
                // dir('폴더명')을 사용하면 해당 하위 폴더 내부로 들어가서 명령어를 실행합니다.
                dir('backend') {
                    sh "docker build -t ${BACKEND_IMAGE} ."
                }
            }
        }

        stage('Build Frontend') {
            steps {
                echo 'React 프론트엔드 Docker 이미지 빌드 중...'
                dir('frontend') {
                    sh "docker build -t ${FRONTEND_IMAGE} ."
                }
            }
        }

        stage('Deploy') {
            steps {
                echo '운영 환경에 컨테이너 배포 중...'
                
                // 1. 기존에 실행 중이던 동일한 이름의 컨테이너가 있다면 중지하고 삭제합니다.
                // (|| true를 붙여서 최초 빌드 때 컨테이너가 없어도 에러로 멈추지 않게 합니다.)
                sh """
                docker stop ${BACKEND_CONTAINER} || true
                docker rm ${BACKEND_CONTAINER} || true
                docker stop ${FRONTEND_CONTAINER} || true
                docker rm ${FRONTEND_CONTAINER} || true
                """

                // 2. 새롭게 빌드된 이미지로 컨테이너를 실행합니다.
                // 포트는 사용하시는 환경에 맞게 변경하셔도 됩니다. (예: 백엔드 5000, 프론트엔드 3000)
                sh "docker run -d --name ${BACKEND_CONTAINER} -p 5000:5000 ${BACKEND_IMAGE}"
                sh "docker run -d --name ${FRONTEND_CONTAINER} -p 5173:80 ${FRONTEND_IMAGE}"
                
                echo '배포가 완료되었습니다!'
            }
        }
    }

    post {
        success {
            echo '🎉 파이프라인 빌드 및 배포 성공!'
        }
        failure {
            echo '❌ 파이프라인 빌드 중 에러가 발생했습니다. 로그를 확인하세요.'
        }
    }
}