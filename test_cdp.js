const { spawn } = require('child_process');
const http = require('http');
const net = require('net');

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\\Users\\hp\\Desktop\\portfoliowebsite\\c_temp',
  'http://localhost:3000'
]);

setTimeout(() => {
  http.get('http://127.0.0.1:9222/json', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const list = JSON.parse(data);
      const target = list.find(p => p.url.includes('3000'));
      if (!target) {
        console.log('Target not found in pages:', list);
        chrome.kill();
        return;
      }

      const wsUrl = new URL(target.webSocketDebuggerUrl);
      const socket = net.createConnection(wsUrl.port, wsUrl.hostname, () => {
        const key = Buffer.from('testkey123456789').toString('base64');
        const req = [
          'GET ' + wsUrl.pathname + ' HTTP/1.1',
          'Host: ' + wsUrl.host,
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Key: ' + key,
          'Sec-WebSocket-Version: 13',
          '\r\n'
        ].join('\r\n');
        socket.write(req);
      });

      let upgraded = false;
      socket.on('data', (buf) => {
        if (!upgraded) {
          if (buf.toString().includes('101 Switching Protocols')) {
            upgraded = true;
            // Send Runtime.evaluate
            const msg = JSON.stringify({
              id: 1,
              method: 'Runtime.evaluate',
              params: {
                expression: JSON.stringify({
                  check: 'test'
                }),
                expression: `(() => {
                  const c = document.getElementById('hero-canvas');
                  const ctx = c ? c.getContext('2d') : null;
                  let px = [0,0,0,0];
                  try {
                    px = Array.from(ctx.getImageData(Math.floor(c.width/2), Math.floor(c.height/2), 1, 1).data);
                  } catch(e) { px = e.message; }
                  return {
                    canvasExists: !!c,
                    width: c ? c.width : 0,
                    height: c ? c.height : 0,
                    pixel: px,
                    scrollY: window.scrollY,
                    bodyHeight: document.body.scrollHeight
                  };
                })()`,
                returnByValue: true
              }
            });

            const payloadBuf = Buffer.from(msg);
            const len = payloadBuf.length;
            let headerBuf;
            if (len < 126) {
              headerBuf = Buffer.from([0x81, 0x80 | len, 0x12, 0x34, 0x56, 0x78]);
            } else {
              headerBuf = Buffer.from([0x81, 0x80 | 126, (len >> 8) & 0xff, len & 0xff, 0x12, 0x34, 0x56, 0x78]);
            }
            const mask = [0x12, 0x34, 0x56, 0x78];
            const maskedPayload = Buffer.alloc(len);
            for (let i = 0; i < len; i++) {
              maskedPayload[i] = payloadBuf[i] ^ mask[i % 4];
            }
            socket.write(Buffer.concat([headerBuf, maskedPayload]));
          }
        } else {
          // Decode WS text frame
          let offset = 2;
          let len = buf[1] & 0x7f;
          if (len === 126) offset = 4;
          else if (len === 127) offset = 10;
          const text = buf.slice(offset).toString('utf8');
          console.log('Result:', text);
          chrome.kill();
          process.exit(0);
        }
      });
    });
  }).on('error', err => {
    console.error('HTTP err:', err.message);
    chrome.kill();
  });
}, 2500);
