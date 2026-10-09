import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{proxy:{'/api':'http://localhost:4000'}},build:{rollupOptions:{output:{manualChunks:{motion:['gsap','@gsap/react'],forms:['zod','react-hook-form','@hookform/resolvers/zod'],query:['@tanstack/react-query']}}}}});
