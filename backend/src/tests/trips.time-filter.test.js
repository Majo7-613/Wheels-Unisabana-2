import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app.js';
import Trip from '../models/Trip.js';
import User from '../models/User.js';

// This test requires the test environment to provide an in-memory or test MongoDB.
// It creates trips with different departureAt and verifies the time-range filter.

describe('Trips time-range filtering', () => {
  let agent;
  let userToken;
  let userId;
  let skipDueToNoDb = false;

  beforeAll(async () => {
    // Ensure DB connection is available
    if (mongoose.connection.readyState !== 1) {
      // If the test environment didn't configure Mongo, skip this suite to avoid false negatives.
      console.warn('Skipping time-range trips test: no MongoDB connection available');
      skipDueToNoDb = true;
      return;
    }
    // Use supertest agent directly against the Express app to avoid
    // creating a real TCP server which can leave open handles in Jest.
    agent = request.agent(app);

    // create a user and get token (simplified: create user and use direct id in req)
    const user = await User.create({
      firstName: 'Test',
      lastName: 'Driver',
      email: `timefilter_${Date.now()}@example.com`,
      universityId: `TST${Date.now()}`,
      phone: '3000000000',
      passwordHash: 'test-hash',
      roles: ['driver']
    });
    userId = user._id.toString();
    // NOTE: The test harness should provide a method to issue JWTs for test users.
    // For simplicity, we'll assume the app exposes a test-only endpoint to create a token: /tests/create-token
    const tokenRes = await agent.post('/tests/create-token').send({ userId });
    expect(tokenRes.status).toBe(200);
    userToken = tokenRes.body.token;
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await Trip.deleteMany({});
      await User.deleteMany({});
      await mongoose.connection.close();
    }
  });

  it('returns only trips within provided start_time and end_time', async () => {
    if (skipDueToNoDb) {
      // Test skipped because no DB configured
      return;
    }

    // create three trips at different times
    const now = new Date();
    const t1 = new Date(now.getTime() + 1000 * 60 * 60 * 24); // +1 day
    const t2 = new Date(now.getTime() + 1000 * 60 * 60 * 48); // +2 days
    const t3 = new Date(now.getTime() + 1000 * 60 * 60 * 72); // +3 days

    const common = {
      driver: userId,
      vehicle: null,
      routeDescription: 'test',
      seatsTotal: 3,
      seatsAvailable: 3,
      pricePerSeat: 10000
    };

    await Trip.create({ ...common, departureAt: t1, origin: 'A', destination: 'B' });
    await Trip.create({ ...common, departureAt: t2, origin: 'C', destination: 'D' });
    await Trip.create({ ...common, departureAt: t3, origin: 'E', destination: 'F' });

    const start = new Date(now.getTime() + 1000 * 60 * 60 * 36).toISOString(); // between t1 and t2 (+1.5 days)
    const end = new Date(now.getTime() + 1000 * 60 * 60 * 60).toISOString(); // between t2 and t3 (+2.5 days)

    const res = await agent.get('/trips').query({ start_time: start, end_time: end });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.trips)).toBe(true);
    // only t2 should be returned
    const returnedTimes = (res.body.trips || []).map((tr) => new Date(tr.departureAt).toISOString());
    expect(returnedTimes.some(rt => rt === t2.toISOString())).toBe(true);
    expect(returnedTimes.some(rt => rt === t1.toISOString())).toBe(false);
    expect(returnedTimes.some(rt => rt === t3.toISOString())).toBe(false);
  }, 20000);
});
