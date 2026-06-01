import { remote } from 'webdriverio';

async function main() {
  const driver = await remote({
    hostname: '127.0.0.1',
    port: 4723,
    path: '/',
    logLevel: 'silent',
    capabilities: {
      platformName: 'Windows',
      'appium:automationName': 'Windows',
      'appium:app': 'Root',
      'appium:deviceName': 'WindowsPC',
    },
  });
  
  const windows = await driver.$$('//Window');
  console.log('Found', windows.length, 'windows:\n');
  
  for (let i = 0; i < windows.length; i++) {
    const name = await windows[i].getAttribute('Name');
    if (name) console.log(`  - ${name}`);
  }
  
  await driver.deleteSession();
}

main();
