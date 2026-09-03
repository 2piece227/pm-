import { defineConfig } from 'vite';

// GitHub Pages 프로젝트 사이트는 https://<user>.github.io/<repo>/ 경로에 뜬다.
// base를 리포 이름으로 맞춰야 빌드된 JS/에셋 경로가 안 깨진다.
export default defineConfig({
  base: '/pm-/',
});
