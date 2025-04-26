import { appendFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';

function logToFile(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  const desktopDir: string = path.join(os.homedir(), 'Desktop');

  const userLogDir: string = path.join(desktopDir, 'Tempest Data');

  if (!existsSync(userLogDir)) {
    mkdirSync(userLogDir, { recursive: true });
    console.log(`Created dir for logs: ${userLogDir}`);
  }

  const logFile: string = path.join(userLogDir, `logs_${process.pid}.txt`);

  appendFileSync(logFile, logMessage, 'utf8');
}


const originalLog = console.log;
console.log = (message: any) => {
  logToFile(message);
  originalLog(message); 
};

const originalError = console.error;
console.error = (message: any) => {
  logToFile(message);
  originalError(message);
};

export { logToFile };
