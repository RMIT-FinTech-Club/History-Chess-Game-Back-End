export const getWalletBalanceSchema = {
	description: 'Get user wallet Balance',
	tags: ['wallet'],
	params: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				format: 'uuid',
				description: 'User ID (UUID)'
			}
		},
		required: ['userId']
	},
	querystring: {

	},
	response: {
		200: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: { type: 'string' },
						totalGameCoins: { type: 'string', description: 'Total balance in GameCoins' },
						confirmedGameCoins: { type: 'string', description: 'Confirmed balance on blockchain' },
						pendingGameCoins: { type: 'string', description: 'Pending rewards not yet confirmed' },
						pendingTransactions: { type: 'number', description: 'Number of pending transactions' },
						lastUpdated: { type: 'string', format: 'date-time' }
					},
					// required: ['userId', 'totalGameCoins', 'confirmedGameCoins', 'pendinggameCoins', 'pendingTransactions', 'lastUpdated']
				},
				// require: ['success', 'data']
			}

		},
		403: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			},
			// required: ['success', 'error']
		},
		500: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			},
			// required: ['success', 'error']
		}
	}
};

export const getWalletStatusSchema = {
	description: 'Get wallet status summary',
	tags: ['wallet'],
	summary: 'Get a quick status overview of the wallet',
	params: {
		type: 'object',
		properties: {
			userId: {
				type: 'string',
				format: 'uuid',
				description: 'User ID (UUID)'
			}
		},
		required: ['userId']
	},
	response: {
		200: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: { type: 'string' },
						hasWallet: { type: 'boolean', description: 'Whether user has a wallet configured' },
						totalBalance: { type: 'string', description: 'Total GameCoins available' },
						hasPendingRewards: { type: 'boolean', description: 'Whether there are pending rewards' },
						pendingCount: { type: 'number', description: 'Number of pending transactions' },
						lastActivity: { type: 'string', format: 'date-time', description: 'Last wallet activity' }
					},
					// required: ['userId', 'hasWallet', 'totalBalance', 'hasPendingRewards', 'pendingCount', 'lastActivity']
				}
			},
			// required: ['success', 'data']
		},
		403: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			},
			// required: ['success', 'error']
		},
		500: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			},
			// required: ['success', 'error']
		}
	}
};