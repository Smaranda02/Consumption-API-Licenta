process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// how to run :
// node index.js

const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Initialize DB
const db = new sqlite3.Database('./consumption.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS DevicesConsumption (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      readingDate TEXT NOT NULL,
      device TEXT NOT NULL,
      min_current REAL,
      max_current REAL,
      UNIQUE(readingDate, device)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS SolarPanelEnergy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      readingDate TEXT NOT NULL,     
      power REAL NOT NULL,      
      energy REAL NOT NULL,          
      timestamp INTEGER NOT NULL     
  )`
  );
});


//populate the whole db 
// const startDate = new Date('2024-08-01');
// const endDate = new Date('2025-04-11');
// const devices = ['ESP1', 'ESP2', 'Solar Panel'];

// function getRandomInRange(min, max) {
//   return +(Math.random() * (max - min) + min).toFixed(2);
// }

// function formatDate(date) {
//   return date.toISOString().split('T')[0]; // YYYY-MM-DD
// }

// db.serialize(() => {
//   const stmt = db.prepare(`
//     INSERT OR IGNORE INTO DevicesConsumption (readingDate, device, min_current, max_current)
//     VALUES (?, ?, ?, ?)
//   `);

//   const currentDate = new Date(startDate);

//   while (currentDate <= endDate) {
//     const readingDate = formatDate(currentDate);

//     devices.forEach(device => {
//       const min_current = getRandomInRange(80, 140);
//       const max_current = getRandomInRange(min_current + 10, min_current + 150);

//       stmt.run(readingDate, device, min_current, max_current);
//     });

//     currentDate.setDate(currentDate.getDate() + 1);
//   }

//   stmt.finalize();
//   console.log('✅ Database populated successfully.');
// });

app.post('/reading', (req, res) => {
    const { device, current } = req.body;

    // console.log("Received: ", req.body);
  
    if (!device || current == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
  
    const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
    // console.log(today)
  
    if(device != "Solar Panel"){
      db.run(`
            INSERT INTO DevicesConsumption (readingDate, device, min_current, max_current)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(readingDate, device) DO UPDATE SET
              min_current = MIN(min_current, excluded.min_current),
              max_current = MAX(max_current, excluded.max_current)
          `, [today, device, current, current], function(err) {
            if (err) {
              console.log("Error: ");
              console.error(err.message);
              return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Reading stored/updated successfully' });
          });
    }
   
  });
  

app.get('/averages', (req, res) => {
    db.all(`
      SELECT readingDate, device, 
             (min_current + max_current) / 2 AS average_current
      FROM DevicesConsumption
      ORDER BY readingDate ASC
    `, [], (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  });


// try {
//     app.listen(PORT, SERVER_IP, () => {
//       console.log(`Server is running on http://${SERVER_IP}:${PORT}`);
//     });
//   } catch (err) {
//     console.error('Error starting server:', err);
//   }


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  
 // Schedule job to run at 00:00 every day
 cron.schedule('0 0 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  // console.log(`🕛 Running cron job for date: ${today}`);

  try {
    const response = await axios.post('http://127.0.0.1:3000/end-of-day-solar-panel', {
      date: today,
    });
    console.log('✅ Cron job succeeded:', response.data);
  } catch (error) {
    console.error('❌ Cron job failed:', error.message);
  }
});

});


app.get('/all', (req, res) => {
    db.all('SELECT * FROM DevicesConsumption', [], (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  });


  

app.get('/min-current', (req, res) => {
  const { device } = req.query;
  db.all(`SELECT min_current FROM DevicesConsumption 
          WHERE device = ? `, [device], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});




app.get('/avg-current-today', (req, res) => {
  const { device } = req.query;
  db.all(`SELECT (min_current + max_current) / 2 AS average_current  FROM DevicesConsumption 
          WHERE device = ? AND readingDate = DATE('now', 'localtime')`, [device], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});




app.get('/min-current-today', (req, res) => {
  const { device } = req.query;
  db.all(`SELECT min_current  FROM DevicesConsumption 
          WHERE device = ? AND readingDate = DATE('now', 'localtime')`, [device], (err, rows) => {
    if (err) {
      console.error(err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(rows);
  });
});


app.get('/consumption', (req, res) => {
    const { device, range } = req.query;
  
    if (!device || !range) {
      return res.status(400).json({ error: 'Missing device or range parameter' });
    }
  
    let dateCondition = '';
    switch (range) {
      case 'day':
        dateCondition = "readingDate = DATE('now', 'localtime')";
        break;
      case 'week':
        dateCondition = "readingDate >= DATE('now', '-6 days', 'localtime')";
        break;
      case 'month':
        dateCondition = "readingDate >= DATE('now', '-1 month', 'localtime')";
        break;
      case '6months':
        dateCondition = "readingDate >= DATE('now', '-6 months', 'localtime')";
        break;
      case 'year':
        dateCondition = "readingDate >= DATE('now', '-1 year', 'localtime')";
        break;
      default:
        return res.status(400).json({ error: 'Invalid range parameter' });
    }
  
    db.all(`
      SELECT readingDate, 
             (min_current + max_current) / 2 AS average_current
      FROM DevicesConsumption
      WHERE device = ? AND ${dateCondition}
      ORDER BY readingDate ASC
    `, [device], (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  });
  


app.get('/consumptionSolarPanel', (req, res) => {
    const { range } = req.query;
    console.log("Hello: ", range)
  
    if (!range) {
      return res.status(400).json({ error: 'Missing device or range parameter' });
    }
  
    let dateCondition = '';
    switch (range) {
      case 'day':
        dateCondition = "readingDate = DATE('now', 'localtime')";
        break;
      case 'week':
        dateCondition = "readingDate >= DATE('now', '-6 days', 'localtime')";
        break;
      case 'month':
        dateCondition = "readingDate >= DATE('now', '-1 month', 'localtime')";
        break;
      case '6months':
        dateCondition = "readingDate >= DATE('now', '-6 months', 'localtime')";
        break;
      case 'year':
        dateCondition = "readingDate >= DATE('now', '-1 year', 'localtime')";
        break;
      default:
        return res.status(400).json({ error: 'Invalid range parameter' });
    }
  
    db.all(`
      SELECT readingDate, 
             power, energy, timestamp
      FROM SolarPanelEnergy
      WHERE ${dateCondition}
      ORDER BY timestamp ASC
    `, (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json(rows);
    });
  });
  

app.post('/solar-panel-reading', (req, res) => {
    const { power, timestamp, time } = req.body;

    // console.log("Received ", timestamp);
    if (power == null || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
      
    const energy = power;  // Power is in watts, and energy is power * time (time is 1 hour here, so it's just power)
  
    db.run(`
      INSERT INTO SolarPanelEnergy (readingDate, power, energy, timestamp)
      VALUES (?, ?, ?, ?)
    `, [timestamp.split('T')[0], power, energy, time], function(err) {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({ message: 'Solar panel reading stored successfully' });
    });
  });


app.post('/end-of-day-solar-panel', (req, res) => {

    const { date } = req.body; // Format: 'YYYY-MM-DD'
  
    if (!date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
  
    // Step 1: Fetch all energy readings for the given day
    db.all(`
      SELECT energy FROM SolarPanelEnergy
      WHERE readingDate = ?
    `, [date], (err, rows) => {
      if (err) {
        console.error(err.message);
        return res.status(500).json({ error: 'Database error while fetching energy readings' });
      }
  
      // Step 2: Sum up total energy
      let totalEnergy = 0;
      rows.forEach(row => {
        totalEnergy += row.energy;
      });
  
      // Step 3: Insert or update total daily energy entry
      db.run(`
        INSERT INTO SolarPanelEnergy (readingDate, panel_power, energy, timestamp)
        VALUES (?, ?, ?, ?)
      `, [date, 0, totalEnergy, `${date}T00:00:00`], function (err) {
        if (err) {
          console.error("Insert error:", err.message);
          return res.status(500).json({ error: 'Failed to store total energy for the day' });
        }
  
        // Step 4: Delete hourly records for that date
        db.run(`
          DELETE FROM SolarPanelEnergy
          WHERE readingDate = ? AND timestamp != ?
        `, [date, `${date}T00:00:00`], function (err) {
          if (err) {
            console.error("Cleanup error:", err.message);
            return res.status(500).json({ error: 'Cleanup failed after aggregation' });
          }
  
          // ✅ Final response sent only once
          res.json({ message: '✅ Total energy stored and hourly data cleaned up', totalEnergy });
        });
      });
    });
  });
  
   
  


//   const options = {
//     timeZone: 'Europe/Bucharest'
//   };
// //  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
//  const today = new Date().toLocaleString('en-GB', options).split('T')[0]; // 'YYYY-MM-DD'
//  console.log(today)