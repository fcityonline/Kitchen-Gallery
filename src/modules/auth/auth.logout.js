// backend/src/modules/auth/auth.logout.js
const jwt = require('jsonwebtoken');
const redis = require('../../config/redis');

exports.logoutHandler = async (req, res) => {
  try {
    const token = req.cookies.refreshToken;

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

      // Remove refresh token from Redis
      await redis.del(`refresh:${decoded.tokenId}`);

      // Optional: blacklist access token
      const accessToken = req.headers.authorization?.split(' ')[1];
      if (accessToken) {
        await redis.set(`bl_${accessToken}`, true, { ex: 60 * 60 }); // blacklist 1h
      }
    }

    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });

    res.json({ message: 'Logged out successfully' });

  } catch (err) {
    res.clearCookie('refreshToken', { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ message: 'Logged out' });
  }
};

// // backend/src/modules/auth/auth.logout.js

// const jwt = require('jsonwebtoken');
// const redis = require('../../config/redis');

// exports.logoutHandler = async (req, res) => {
//   try {
//     const token = req.cookies.refreshToken;
//     if (token) {
//       const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//       await redis.del(`refresh:${decoded.tokenId}`);
//     }

//     res.clearCookie('refreshToken');

//     res.json({ message: 'Logged out successfully' });

//   } catch (err) {
//     res.clearCookie('refreshToken');
//     res.json({ message: 'Logged out' });
//   }
// };