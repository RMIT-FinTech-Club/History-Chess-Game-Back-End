export const getWalletBalanceSchema = {
	description: 'Get user wallet Balance',
	tags: ['wallet'],
	security: [{ bearerAuth: [] as string[] }],
	response: {
		200: {
			description: 'Successful response',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: {
							type: 'string',
							format: 'uuid',
							description: 'User ID'
						},
						username: {
							type: 'string',
							description: 'Username'
						},
						totalGameCoins: {
							type: 'string',
							description: 'Total balance (confirmed + pending)'
						},
						confirmedGameCoins: {
							type: 'string',
							description: 'Confirmed balance on blockchain',
						
						},
						pendingGameCoins: {
							type: 'string',
							description: 'Pending rewards awaiting confirmation',
							
						},
						pendingTransactions: {
							type: 'number',
							description: 'Number of pending transactions',

						},
						lastUpdated: {
							type: 'string',
							format: 'date-time',
							description: 'Last balance update timestamp',
							
						}
					},
					required: ['userId', 'totalGameCoins', 'confirmedGameCoins', 'pendingGameCoins', 'pendingTransactions']
				}
			},
			required: ['success', 'data']
		},
		401: {
			description: 'Unauthorized - Invalid or missing token',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: {
					type: 'string',
					
				}
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: {
					type: 'string',
					
				}
			}
		}
	}
};

export const getWalletStatusSchema = {
	description: 'Get wallet status summary',
	tags: ['wallet'],
	summary: 'Quick overview of wallet status',
	security: [{ bearerAuth: [] as string[] }],
	response: {
		200: {
			description: 'Successful response',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: {
							type: 'string',
							format: 'uuid',
						
						},
						username: {
							type: 'string',
							
						},
						hasWallet: {
							type: 'boolean',
							description: 'Whether user has a wallet configured',
							
						},
						totalBalance: {
							type: 'string',
							description: 'Total GameCoins available',
							
						},
						hasPendingRewards: {
							type: 'boolean',
							description: 'Whether there are pending rewards',
							
						},
						pendingCount: {
							type: 'number',
							description: 'Number of pending transactions',
							
						},
						lastActivity: {
							type: 'string',
							format: 'date-time',
							description: 'Last wallet activity timestamp',
							
						}
					},
					required: ['userId', 'hasWallet', 'totalBalance', 'hasPendingRewards', 'pendingCount']
				}
			},
			required: ['success', 'data']
		},
		401: {
			description: 'Unauthorized',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			}
		}
	}
};

export const getWalletHistorySchema = {
	description: 'Get reward history for authenticated user',
	tags: ['wallet'],
	summary: 'List of all rewards earned by the user',
	security: [{ bearerAuth: [] as string[] }],
	querystring: {
		type: 'object',
		properties: {
			limit: {
				type: 'integer',
				minimum: 1,
				maximum: 20,
				default: 10,
				description: 'Number of rewards to return (max 100)'
			}
		}
	},
	response: {
		200: {
			description: 'Successful response',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: {
							type: 'string',
							format: 'uuid'
						},
						username: {
							type: 'string',
							
						},
						totalRewards: {
							type: 'number',
							description: 'Number of rewards returned',
							
						},
						rewards: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									gameSessionId: {
										type: 'string',
										description: 'Game session ID',
										
									},
									rewardAmount: {
										type: 'string',
										description: 'Reward amount in GameCoins',
										
									},
									matchType: {
										type: 'string',
										enum: ['PvP', 'Bot'],
										description: 'Type of match',
										
									},
									gameResult: {
										type: 'string',
										description: 'Game result',
										
									},
									gameEndTime: {
										type: 'string',
										format: 'date-time',
										description: 'When the game ended',
										
									},
									confirmed: {
										type: 'boolean',
										description: 'Whether reward is confirmed on blockchain',
										
									},
									transactionHash: {
										type: 'string',
										description: 'Blockchain transaction hash',
										
									},
									blockNumber: {
										type: 'number',
										description: 'Block number where transaction was mined',
										
									},
									confirmedAt: {
										type: 'string',
										format: 'date-time',
										description: 'When reward was confirmed',
										
									}
								},
								required: ['gameSessionId', 'rewardAmount', 'matchType', 'gameResult', 'gameEndTime', 'confirmed']
							}
						},
						pagination: {
							type: 'object',
							properties: {
								limit: {
									type: 'number',
									description: 'Requested limit',
									
								},
								hasMore: {
									type: 'boolean',
									description: 'Whether there are more rewards available',
									
								}
							},
							required: ['limit', 'hasMore']
						}
					},
					required: ['userId', 'totalRewards', 'rewards', 'pagination']
				}
			},
			required: ['success', 'data']
		},
		400: {
			description: 'Bad request - Invalid query parameters',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: {
					type: 'string'
				}
			}
		},
		401: {
			description: 'Unauthorized',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			}
		}
	}
};

export const getPendingTransactionsSchema = {
	description: 'Get pending transactions for authenticated user',
	tags: ['wallet'],
	summary: 'List of transactions awaiting blockchain confirmation',
	security: [{ bearerAuth: [] as string[] }],
	response: {
		200: {
			description: 'Successful response',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				data: {
					type: 'object',
					properties: {
						userId: {
							type: 'string',
							format: 'uuid'
						},
						username: {
							type: 'string'
						},
						pendingBalance: {
							type: 'string',
							description: 'Total pending balance'
						},
						pendingTransactions: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									transactionHash: {
										type: 'string',
										description: 'Transaction hash (temporary or real)'
									},
									amount: {
										type: 'string',
										description: 'Reward amount'
									},
									type: {
										type: 'string',
										enum: ['PvP', 'Bot'],
										description: 'Match type'
									},
									status: {
										type: 'string',
										description: 'Transaction status'
									},
									createdAt: {
										type: 'string',
										format: 'date-time',
										description: 'When transaction was created'
									},
									blockNumber: {
										type: 'number',
										description: 'Block number (if mined)'
									}
								},
								required: ['transactionHash', 'amount', 'type', 'status', 'createdAt']
							}
						}
					},
					required: ['userId', 'pendingBalance', 'pendingTransactions']
				}
			},
			required: ['success', 'data']
		},
		401: {
			description: 'Unauthorized',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string' }
			}
		},
		500: {
			description: 'Internal server error',
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				error: { type: 'string'}
			}
		}
	}
};