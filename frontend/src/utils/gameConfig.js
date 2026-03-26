// Professional game configuration - knows which games need what info

export const GAME_CONFIGS = {
  // Games that require Player ID/UID
  'free-fire': {
    name: 'Free Fire',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'Player ID',
    playerIdPlaceholder: 'Enter your Free Fire Player ID',
    instructions: 'Open Free Fire → Profile → Copy your Player ID'
  },
  'mobile-legends': {
    name: 'Mobile Legends',
    requiresPlayerId: true,
    requiresCredentials: false,
    requiresServerId: true,
    playerIdLabel: 'Player ID',
    playerIdPlaceholder: 'Enter your Game ID',
    serverIdLabel: 'Server ID (Zone ID)',
    serverIdPlaceholder: 'e.g. 2345',
    instructions: 'Profile → Account → Game ID and Zone ID'
  },
  'pubg-mobile': {
    name: 'PUBG Mobile',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'Character ID',
    playerIdPlaceholder: 'Enter your PUBG Character ID',
    instructions: 'Settings → Basic → Character → Character ID'
  },
  'genshin-impact': {
    name: 'Genshin Impact',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'UID',
    playerIdPlaceholder: 'Enter your 9-digit UID',
    instructions: 'Paimon Menu → Settings → Account → UID'
  },
  'call-of-duty': {
    name: 'Call of Duty Mobile',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'Player ID',
    playerIdPlaceholder: 'Enter your COD Mobile Player ID',
    instructions: 'Profile → Copy ID'
  },
  'valorant': {
    name: 'Valorant',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'Riot ID',
    playerIdPlaceholder: 'Username#TAG',
    instructions: 'Example: PlayerName#NA1'
  },
  'roblox': {
    name: 'Roblox',
    requiresPlayerId: true,
    requiresCredentials: false,
    playerIdLabel: 'Username',
    playerIdPlaceholder: 'Enter your Roblox username',
    instructions: 'Your Roblox username'
  },
  
  // Games/Services that require login credentials
  'netflix': {
    name: 'Netflix',
    requiresPlayerId: false,
    requiresCredentials: true,
    credentialFields: ['email', 'password'],
    instructions: 'We need your Netflix account credentials to add subscription'
  },
  'spotify': {
    name: 'Spotify',
    requiresPlayerId: false,
    requiresCredentials: true,
    credentialFields: ['email', 'password'],
    instructions: 'Your Spotify account login credentials'
  },
  'disney-plus': {
    name: 'Disney+',
    requiresPlayerId: false,
    requiresCredentials: true,
    credentialFields: ['email', 'password'],
    instructions: 'Disney+ account credentials for subscription'
  },
  'xbox-game-pass': {
    name: 'Xbox Game Pass',
    requiresPlayerId: false,
    requiresCredentials: true,
    credentialFields: ['email', 'password'],
    instructions: 'Microsoft account email and password'
  },
  'playstation-plus': {
    name: 'PlayStation Plus',
    requiresPlayerId: false,
    requiresCredentials: true,
    credentialFields: ['email', 'password'],
    instructions: 'PlayStation Network account credentials'
  },
  
  // Gift cards and services that need nothing
  'steam-wallet': {
    name: 'Steam Wallet',
    requiresPlayerId: false,
    requiresCredentials: false,
    instructions: 'Digital code will be sent via email'
  },
  'google-play': {
    name: 'Google Play Gift Card',
    requiresPlayerId: false,
    requiresCredentials: false,
    instructions: 'Redeem code in Google Play Store'
  },
  'itunes': {
    name: 'iTunes/App Store',
    requiresPlayerId: false,
    requiresCredentials: false,
    instructions: 'Redeem in App Store → Account → Redeem Gift Card'
  },
  'amazon-gift-card': {
    name: 'Amazon Gift Card',
    requiresPlayerId: false,
    requiresCredentials: false,
    instructions: 'Redeem at amazon.com/redeem'
  }
};

// Helper function to get game config by product name or slug
export const getGameConfig = (productNameOrSlug) => {
  if (!productNameOrSlug) return null;
  
  const searchTerm = productNameOrSlug.toLowerCase();
  
  // Find matching game config
  for (const [key, config] of Object.entries(GAME_CONFIGS)) {
    if (searchTerm.includes(key) || searchTerm.includes(config.name.toLowerCase())) {
      return { ...config, slug: key };
    }
  }
  
  return null;
};

// Auto-detect requirements from product
export const detectProductRequirements = (productName, category) => {
  const gameConfig = getGameConfig(productName);
  
  if (gameConfig) {
    return {
      requiresPlayerId: gameConfig.requiresPlayerId,
      requiresCredentials: gameConfig.requiresCredentials,
      requiresServerId: gameConfig.requiresServerId || false,
      playerIdLabel: gameConfig.playerIdLabel,
      serverIdLabel: gameConfig.serverIdLabel,
      serverIdPlaceholder: gameConfig.serverIdPlaceholder,
      credentialFields: gameConfig.credentialFields,
      instructions: gameConfig.instructions
    };
  }
  
  // Default fallback based on category
  if (category === 'topup') {
    return {
      requiresPlayerId: true,
      requiresCredentials: false,
      playerIdLabel: 'Player ID/UID',
      instructions: 'Enter your in-game Player ID'
    };
  }
  
  if (category === 'subscription') {
    return {
      requiresPlayerId: false,
      requiresCredentials: true,
      credentialFields: ['email', 'password'],
      instructions: 'Account credentials required'
    };
  }
  
  // Gift cards need nothing
  return {
    requiresPlayerId: false,
    requiresCredentials: false,
    instructions: 'Code will be delivered via email'
  };
};
