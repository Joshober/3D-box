import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:45000,
  use:{baseURL:'http://127.0.0.1:4202',viewport:{width:1440,height:1050},launchOptions:{args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}},
  webServer:{command:'npm run serve:production',env:{PORT:'4202'},url:'http://127.0.0.1:4202',reuseExistingServer:false,timeout:120000}
});
