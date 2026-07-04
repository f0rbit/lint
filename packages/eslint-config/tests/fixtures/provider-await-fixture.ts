type MessageProvider = {
	send(message: string): Promise<void>;
};

const sent: string[] = [];

export const memory_provider: MessageProvider = {
	async send(message: string): Promise<void> {
		sent.push(message);
	},
};
