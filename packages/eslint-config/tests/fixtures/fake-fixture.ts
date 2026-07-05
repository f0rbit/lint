// Clean implementation using in-memory fakes instead of mocks

interface NotificationProvider {
	send(message: string): Promise<void>;
}

class InMemoryNotificationProvider implements NotificationProvider {
	private sent_messages: string[] = [];

	async send(message: string): Promise<void> {
		this.sent_messages.push(message);
	}

	get_sent_messages(): string[] {
		return [...this.sent_messages];
	}
}

const provider = new InMemoryNotificationProvider();
const messages = provider.get_sent_messages();
