// backend/src/modules/auth/auth.refresh.js

// src/modules/auth/auth.refresh.js

const jwt = require('jsonwebtoken');
const redis = require('../../config/redis');
const { generateAccessToken, generateRefreshToken } = require('../../utils/token');
const { v4: uuidv4 } = require('uuid');

exports.refreshTokenHandler = async (req, res, next) => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      return res.status(401).json({ message: 'No token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const exists = await redis.get(`refresh:${decoded.tokenId}`);
    if (!exists) {
      return res.status(401).json({ message: 'Invalid session' });
    }

    // 🔁 ROTATE TOKEN
    await redis.del(`refresh:${decoded.tokenId}`);

    const newTokenId = uuidv4();

    const newRefreshToken = generateRefreshToken({
      id: decoded.id,
      role: decoded.role,
      tokenId: newTokenId
    });

await redis.set(
  `refresh:${newTokenId}`,
  decoded.id,
  {
    ex: 7 * 24 * 60 * 60
  }
);

    const newAccessToken = generateAccessToken({
      _id: decoded.id,
      role: decoded.role
    });

    // 🍪 SET COOKIE
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    return res.json({ accessToken: newAccessToken });

  } catch (err) {
    return next(err);
  }
};