import { remote } from 'webdriverio';
import { execSync } from 'child_process';

/**
 * Extracts and parses chat messages from Microsoft Teams.
 */

// Bring Teams window to foreground using PowerShell/Win32
function bringTeamsToForeground() {
  console.log('Bringing Teams to foreground...');
  try {
    execSync(`powershell -Command "
      Add-Type @'
      using System;
      using System.Runtime.InteropServices;
      public class Win32Focus {
        [DllImport(\\"user32.dll\\")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport(\\"user32.dll\\")]
        public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
      }
'@
      $teams = Get-Process ms-teams -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
      if ($teams) {
        [Win32Focus]::ShowWindow($teams.MainWindowHandle, 9)
        [Win32Focus]::SetForegroundWindow($teams.MainWindowHandle)
      }
    "`, { stdio: 'pipe' });
  } catch (e) {
    // Ignore errors, we'll try anyway
  }
}

async function main() {
  let driver;
  let teamsDriver;

  try {
    // First, bring Teams to foreground
    bringTeamsToForeground();
    
    // Give it a moment to come to front
    await new Promise(r => setTimeout(r, 500));

    console.log('Connecting to WinAppDriver...');

    // Connect to desktop root
    driver = await remote({
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

    console.log('Looking for Teams window...');

    const teamsWindows = await driver.$$('//Window[contains(@Name, "Teams")]');
    
    if (teamsWindows.length === 0) {
      throw new Error('Could not find Teams window. Make sure Teams is running.');
    }
    
    const teamsWindow = teamsWindows[0];
    
    // Click on the window to ensure it's focused
    await teamsWindow.click();
    await new Promise(r => setTimeout(r, 300));
    
    const windowHandle = await teamsWindow.getAttribute('NativeWindowHandle');
    const hexHandle = '0x' + parseInt(windowHandle).toString(16);
    
    await driver.deleteSession();
    driver = null;
    
    // Attach to Teams
    console.log('Attaching to Teams...');
    teamsDriver = await remote({
      hostname: '127.0.0.1',
      port: 4723,
      path: '/',
      logLevel: 'silent',
      capabilities: {
        platformName: 'Windows',
        'appium:automationName': 'Windows',
        'appium:appTopLevelWindow': hexHandle,
        'appium:deviceName': 'WindowsPC',
      },
    });

    console.log('Extracting chat messages...\n');

    // Find message bodies - these contain the full message text with sender and timestamp
    const messageElements = await teamsDriver.$$('//*[contains(@AutomationId, "message-body")]');
    
    console.log(`Found ${messageElements.length} messages\n`);
    console.log('='.repeat(80));
    console.log(' TEAMS CHAT MESSAGES');
    console.log('='.repeat(80) + '\n');

    const messages = [];

    for (const element of messageElements) {
      try {
        const fullText = await element.getAttribute('Name');
        const automationId = await element.getAttribute('AutomationId');
        
        if (fullText) {
          const parsed = parseTeamsMessage(fullText, automationId);
          messages.push(parsed);
          
          console.log(`[${parsed.sender}] ${parsed.timestamp}`);
          console.log(`  ${parsed.message}`);
          console.log('');
        }
      } catch (e) {
        // Element may have gone stale
      }
    }

    console.log('='.repeat(80));
    console.log(`Total: ${messages.length} messages extracted`);
    console.log('='.repeat(80));

    return messages;

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (teamsDriver) {
      await teamsDriver.deleteSession();
    }
    if (driver) {
      await driver.deleteSession();
    }
  }
}

/**
 * Parse a Teams message to extract sender, timestamp, and message content
 */
function parseTeamsMessage(fullText, automationId) {
  // Teams message format: "message text Sender Name (Team) DayOfWeek, Month DD, YYYY H:MM AM/PM."
  // Or: "message text Sender Name H:MM AM/PM." for same-day messages
  
  // Pattern: Look for day of week + full date + time at the end
  const fullDatePattern = /^(.+?)\s+([A-Za-z][A-Za-z\s()0-9-]+?)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\w+\s+\d{1,2},\s+\d{4})\s+(\d{1,2}:\d{2}\s+[AP]M)\.?$/;
  
  // Pattern: Look for time only at the end (same day messages)
  const timeOnlyPattern = /^(.+?)\s+([A-Za-z][A-Za-z\s()0-9-]+?)\s+(\d{1,2}:\d{2}\s+[AP]M)\.?$/;
  
  let match = fullText.match(fullDatePattern);
  if (match) {
    return {
      message: match[1].trim(),
      sender: match[2].trim(),
      timestamp: `${match[3]}, ${match[4]} ${match[5]}`,
      raw: fullText,
      id: automationId
    };
  }
  
  match = fullText.match(timeOnlyPattern);
  if (match) {
    return {
      message: match[1].trim(),
      sender: match[2].trim(),
      timestamp: match[3],
      raw: fullText,
      id: automationId
    };
  }

  // Fallback - couldn't parse, return raw
  return {
    message: fullText,
    sender: 'Unknown',
    timestamp: '',
    raw: fullText,
    id: automationId
  };
}

main();
