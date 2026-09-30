const { defineConfig, devices } = require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests',
  testMatch:'app.spec.cjs',
  timeout:45000,
  fullyParallel:false,
  workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:8765',locale:'ru-RU',colorScheme:'light',trace:'retain-on-failure'},
  projects:[
    {name:'chromium-mobile',use:{...devices['Pixel 7'],viewport:{width:390,height:844}}},
    {name:'webkit-iphone',use:{...devices['iPhone 13'],viewport:{width:390,height:844}}}
  ],
  webServer:{command:'node tests/server.cjs',url:'http://127.0.0.1:8765',reuseExistingServer:false}
});