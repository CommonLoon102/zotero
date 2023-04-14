var EXPORTED_SYMBOLS = ["TranslationParent", "TranslationManager"];

const Zotero = Components.classes['@zotero.org/Zotero;1']
	.getService(Components.interfaces.nsISupports)
	.wrappedJSObject;

const TranslationManager = new class {
	_registeredRemoteTranslates = new Map();
	
	add(id) {
		this._registeredRemoteTranslates.set(id, {
			translatorProvider: null,
			handlers: {},
		});
	}
	
	remove(id) {
		this._registeredRemoteTranslates.delete(id);
	}
	
	getTranslatorProvider(id) {
		return this._registeredRemoteTranslates.get(id).translatorProvider;
	}
	
	setTranslatorProvider(id, provider) {
		this._registeredRemoteTranslates.get(id).translatorProvider = provider;
	}
	
	setHandler(id, name, handler) {
		if (this._registeredRemoteTranslates.get(id).handlers[name]) {
			this._registeredRemoteTranslates.get(id).handlers[name] = [
				...this._registeredRemoteTranslates.get(id).handlers[name],
				handler
			];
		}
		else {
			this._registeredRemoteTranslates.get(id).handlers[name] = [handler];
		}
	}

	clearHandlers(id, name) {
		this._registeredRemoteTranslates.get(id).handlers[name] = null;
	}

	async runHandler(id, name, ...args) {
		let handlers = this._registeredRemoteTranslates.get(id).handlers[name];
		let returnValue = null;
		if (handlers) {
			for (let handler of handlers) {
				try {
					returnValue = await handler(...args);
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		}
		return returnValue;
	}
};

class TranslationParent extends JSWindowActorParent {
	async receiveMessage(message) {
		let { name, data } = message;
		switch (name) {
			case 'Translators:call': {
				let { id, method, args } = data;
				let provider = TranslationManager.getTranslatorProvider(id) || Zotero.Translators;
				return provider[method](...args);
			}
			
			case 'Translate:runHandler': {
				let { id, name, arg } = data;
				return TranslationManager.runHandler(id, name, arg);
			}
		}
	}
}
