// Scholar for Firefox Ingester Browser Functions
// Based on code taken from Greasemonkey and PiggyBank
// This code is licensed according to the GPL

//////////////////////////////////////////////////////////////////////////////
//
// Scholar_Ingester_Interface
//
//////////////////////////////////////////////////////////////////////////////

// Class to interface with the browser when ingesting data

var Scholar_Ingester_Interface = function() {}

//////////////////////////////////////////////////////////////////////////////
//
// Public Scholar_Ingester_Interface methods
//
//////////////////////////////////////////////////////////////////////////////

/*
 * Initialize some variables and prepare event listeners for when chrome is done
 * loading
 */
Scholar_Ingester_Interface.init = function() {
	Scholar_Ingester_Interface.browserData = new Object();
	Scholar_Ingester_Interface._scrapePopupShowing = false;
	Scholar.Ingester.ProxyMonitor.init();
	Scholar.Ingester.MIMEHandler.init();
	
	window.addEventListener("load", Scholar_Ingester_Interface.chromeLoad, false);
	window.addEventListener("unload", Scholar_Ingester_Interface.chromeUnload, false);
}

/*
 * When chrome loads, register our event handlers with the appropriate interfaces
 */
Scholar_Ingester_Interface.chromeLoad = function() {
	Scholar_Ingester_Interface.tabBrowser = document.getElementById("content");
	Scholar_Ingester_Interface.appContent = document.getElementById("appcontent");
	Scholar_Ingester_Interface.statusImage = document.getElementById("scholar-status-image");
	
	// this gives us onLocationChange, for updating when tabs are switched/created
	Scholar_Ingester_Interface.tabBrowser.addEventListener("TabClose",
	    Scholar_Ingester_Interface.tabClose, false);
	Scholar_Ingester_Interface.tabBrowser.addEventListener("TabSelect",
	    Scholar_Ingester_Interface.tabSelect, false);
	// this is for pageshow, for updating the status of the book icon
	Scholar_Ingester_Interface.appContent.addEventListener("pageshow",
		Scholar_Ingester_Interface.contentLoad, true);
}

/*
 * When chrome unloads, delete our document objects and remove our listeners
 */
Scholar_Ingester_Interface.chromeUnload = function() {
	delete Scholar_Ingester_Interface.browserData;
}

/*
 * Scrapes a page (called when the capture icon is clicked); takes a collection
 * ID as the argument
 */
Scholar_Ingester_Interface.scrapeThisPage = function(saveLocation) {
	var browser = Scholar_Ingester_Interface.tabBrowser.selectedBrowser;
	var data = Scholar_Ingester_Interface._getData(browser);
	
	if(data.translators && data.translators.length) {
		Scholar_Ingester_Interface.Progress.show();
		
		if(saveLocation) {
			saveLocation = Scholar.Collections.get(saveLocation);
		} else { // save to currently selected project, if a project is selected
			try {
				saveLocation = ScholarPane.getSelectedCollection();
			} catch(e) {}
		}
		
		var translate = new Scholar.Translate("web");
		translate.setDocument(data.document);
		// use first translator available
		translate.setTranslator(data.translators[0]);
		translate.setHandler("select", Scholar_Ingester_Interface._selectItems);
		translate.setHandler("itemDone", function(obj, item) { Scholar_Ingester_Interface._itemDone(obj, item, saveLocation) });
		translate.setHandler("done", function(obj, item) { Scholar_Ingester_Interface._finishScraping(obj, item, saveLocation) });
		translate.translate();
	}
}

/*
 * An event handler called when a new document is loaded. Creates a new document
 * object, and updates the status of the capture icon
 */
Scholar_Ingester_Interface.contentLoad = function(event) {
	if(event.originalTarget instanceof HTMLDocument) {
		var doc = event.originalTarget;
		var rootDoc = doc;
		
		// get the appropriate root document to check which browser we're on
		Scholar.debug("getting root document");
		while(rootDoc.defaultView.frameElement) {
			rootDoc = rootDoc.defaultView.frameElement.ownerDocument;
		}
		
		// Figure out what browser this contentDocument is associated with
		var browser;
		Scholar.debug("getting browser");
		for(var i=0; i<Scholar_Ingester_Interface.tabBrowser.browsers.length; i++) {
			if(rootDoc == Scholar_Ingester_Interface.tabBrowser.browsers[i].contentDocument) {
				browser = Scholar_Ingester_Interface.tabBrowser.browsers[i];
				break;
			}
		}
		if(!browser) {
			return;
		}
		
		Scholar.debug("getting data");
		// get data object
		var data = Scholar_Ingester_Interface._getData(browser);
		
		// if there's already a scrapable page in the browser window, and it's
		// still there, return
		if(data.translators && data.translators.length && data.document.location) {
			return;
		}
		
		Scholar.debug("translating");
		// get translators
		var translate = new Scholar.Translate("web");
		translate.setDocument(doc);
		data.translators = translate.getTranslators();
		// update status
		Scholar_Ingester_Interface._updateStatus(data);
		// add document
		if(data.translators && data.translators.length) {
			data.document = doc;
		}
	}
}

/*
 * called when a tab is closed
 */
Scholar_Ingester_Interface.tabClose = function(event) {
	// To execute if document object does not exist
	Scholar_Ingester_Interface._deleteData(event.target.linkedBrowser);
}

/*
 * called when a tab is switched
 */
Scholar_Ingester_Interface.tabSelect = function(event) {
	var data = Scholar_Ingester_Interface._getData(Scholar_Ingester_Interface.tabBrowser.selectedBrowser);
	Scholar_Ingester_Interface._updateStatus(data);
	// Make sure scrape progress is gone
	Scholar_Ingester_Interface.Progress.kill();
}

Scholar_Ingester_Interface.hidePopup = function(collectionID) {
	Scholar_Ingester_Interface._scrapePopupShowing = false;
}

Scholar_Ingester_Interface.showPopup = function(collectionID, parentElement) {
	if(Scholar_Ingester_Interface._scrapePopupShowing && parentElement.hasChildNodes()) {
		return false;	// Don't dynamically reload popups that are already showing
	}
	Scholar_Ingester_Interface._scrapePopupShowing = true;
	
	while(parentElement.hasChildNodes()) {
		parentElement.removeChild(parentElement.firstChild);
	}
	
	if(collectionID == null) {	// show library
		var newItem = document.createElement("menuitem");
		newItem.setAttribute("label", Scholar.getString("pane.collections.library"));
		newItem.setAttribute("class", "menuitem-iconic scholar-scrape-popup-library");
		newItem.setAttribute("oncommand", 'Scholar_Ingester_Interface.scrapeThisPage()');
		parentElement.appendChild(newItem);
	}
	
	var childrenList = Scholar.getCollections(collectionID);
	for(var i = 0; i < childrenList.length; i++) {
		if(childrenList[i].hasChildCollections()) {
			var newItem = document.createElement("menu");
			var subMenu = document.createElement("menupopup");
			subMenu.setAttribute("onpopupshowing", 'Scholar_Ingester_Interface.showPopup("'+childrenList[i].getID()+'", this)');
			newItem.setAttribute("class", "menu-iconic scholar-scrape-popup-collection");
			newItem.appendChild(subMenu);
		} else {
			var newItem = document.createElement("menuitem");
			newItem.setAttribute("class", "menuitem-iconic scholar-scrape-popup-collection");
		}
		newItem.setAttribute("label", childrenList[i].getName());
		newItem.setAttribute("oncommand", 'Scholar_Ingester_Interface.scrapeThisPage("'+childrenList[i].getID()+'")');
		
		parentElement.appendChild(newItem);
	}
	
	return true;
}

//////////////////////////////////////////////////////////////////////////////
//
// Private Scholar_Ingester_Interface methods
//
//////////////////////////////////////////////////////////////////////////////

/*
 * Gets a data object given a browser window object
 * 
 * NOTE: Browser objects are associated with document objects via keys generated
 * from the time the browser object is opened. I'm not sure if this is the
 * appropriate mechanism for handling this, but it's what PiggyBank used and it
 * appears to work.
 *
 * Currently, the data object contains only one property: "translators," which
 * is an array of translators that should work with the given page as returned
 * from Scholar.Translate.getTranslator()
 */
Scholar_Ingester_Interface._getData = function(browser) {
	try {
		var key = browser.getAttribute("scholar-key");
		if(Scholar_Ingester_Interface.browserData[key]) {
			return Scholar_Ingester_Interface.browserData[key];
		}
	} finally {
		if(!key) {
			var key = (new Date()).getTime();
			browser.setAttribute("scholar-key", key);
			Scholar_Ingester_Interface.browserData[key] = new Array();
			return Scholar_Ingester_Interface.browserData[key];
		}
	}
	return false;
}

/*
 * Deletes the document object associated with a given browser window object
 */
Scholar_Ingester_Interface._deleteData = function(browser) {
	try {
		var key = browser.getAttribute("scholar-key");
		if(Scholar_Ingester_Interface.browserData[key]) {
			delete Scholar_Ingester_Interface.browserData[key];
			return true;
		}
	} finally {}
	return false;
}

/*
 * Updates the status of the capture icon to reflect the scrapability or lack
 * thereof of the current page
 */
Scholar_Ingester_Interface._updateStatus = function(data) {
	if(data.translators && data.translators.length) {
		var itemType = data.translators[0].itemType;
		if(itemType == "multiple") {
			// Use folder icon for multiple types, for now
			Scholar_Ingester_Interface.statusImage.src = "chrome://scholar/skin/treesource-collection.png";
		} else {
			Scholar_Ingester_Interface.statusImage.src = "chrome://scholar/skin/treeitem-"+itemType+".png";
		}
		Scholar_Ingester_Interface.statusImage.hidden = false;
	} else {
		Scholar_Ingester_Interface.statusImage.hidden = true;
	}
}

/*
 * Callback to be executed when an item has been finished
 */
Scholar_Ingester_Interface._itemDone = function(obj, item, collection) {
	var title = item.getField("title");
	var icon = "chrome://scholar/skin/treeitem-"+Scholar.ItemTypes.getName(item.getField("itemTypeID"))+".png"
	Scholar_Ingester_Interface.Progress.addLines([title], [icon]);
	
	// add item to collection, if one was specified
	if(collection) {
		Scholar.Notifier.disable();
		collection.addItem(item.getID());
		Scholar.Notifier.enable();
	}
}

/*
 * called when a user is supposed to select items
 */
Scholar_Ingester_Interface._selectItems = function(obj, itemList) {
	// this is kinda ugly, mozillazine made me do it! honest!
	var io = { dataIn:itemList, dataOut:null }
	var newDialog = window.openDialog("chrome://scholar/content/ingester/selectitems.xul",
		"_blank","chrome,modal,centerscreen,resizable=yes", io);
	
	if(!io.dataOut) {	// user selected no items, so kill the progress indicatior
		Scholar_Ingester_Interface.Progress.kill();
	}
	
	return io.dataOut;
}

/*
 * Callback to be executed when scraping is complete
 */
Scholar_Ingester_Interface._finishScraping = function(obj, returnValue, collection) {
	if(!returnValue) {
		Scholar_Ingester_Interface.Progress.changeHeadline(Scholar.getString("ingester.scrapeError"));
		Scholar_Ingester_Interface.Progress.addDescription(Scholar.getString("ingester.scrapeErrorDescription"));
	}
	
	if(collection) {
		// notify about modified items
		Scholar.Notifier.trigger("modify", "collection", collection.getID());
	}
	
	Scholar_Ingester_Interface.Progress.fade();
}

//////////////////////////////////////////////////////////////////////////////
//
// Scholar.Ingester.Progress
//
//////////////////////////////////////////////////////////////////////////////

// Handles the display of a div showing progress in scraping
Scholar_Ingester_Interface.Progress = new function() {
	var _windowLoaded = false;
	var _windowLoading = false;
	// keep track of all of these things in case they're called before we're
	// done loading the progress window
	var _loadDescription = null;
	var _loadLines = new Array();
	var _loadIcons = new Array();
	var _loadHeadline = Scholar.getString("ingester.scraping");
	
	this.show = show;
	this.changeHeadline = changeHeadline;
	this.addLines = addLines;
	this.addDescription = addDescription;
	this.fade = fade;
	this.kill = kill;
	
	function show() {
		if(_windowLoading || _windowLoaded) {	// already loading or loaded
			return false;
		}
		_progressWindow = window.openDialog("chrome://scholar/chrome/ingester/progress.xul", "", "chrome,dialog=no,titlebar=no,popup=yes");
		_progressWindow.addEventListener("load", _onWindowLoaded, false);
		_windowLoading = true;
		
		return true;
	}
	
	function changeHeadline(headline) {
		if(_windowLoaded) {
			_progressWindow.document.getElementById("scholar-progress-text-headline").value = headline;
		} else {
			_loadHeadline = headline;
		}
	}
	
	function addLines(label, icon) {
		if(_windowLoaded) {
			for(i in label) {
				var newLabel = _progressWindow.document.createElement("label");
				newLabel.setAttribute("class", "scholar-progress-item-label");
				newLabel.setAttribute("crop", "end");
				newLabel.setAttribute("value", label[i]);
				
				var newImage = _progressWindow.document.createElement("image");
				newImage.setAttribute("class", "scholar-progress-item-icon");
				newImage.setAttribute("src", icon[i]);
				
				var newHB = _progressWindow.document.createElement("hbox");
				newHB.setAttribute("class", "scholar-progress-item-hbox");
				newHB.setAttribute("valign", "center");
				newHB.appendChild(newImage);
				newHB.appendChild(newLabel);
				
				_progressWindow.document.getElementById("scholar-progress-text-box").appendChild(newHB);
			}
			
			_move();
		} else {
			_loadLines = _loadLines.concat(label);
			_loadIcons = _loadIcons.concat(icon);
		}
	}
	
	function addDescription(text) {
		if(_windowLoaded) {
			var newHB = _progressWindow.document.createElement("hbox");
			newHB.setAttribute("class", "scholar-progress-item-hbox");
			var newDescription = _progressWindow.document.createElement("description");
			newDescription.setAttribute("class", "scholar-progress-description");
			var newText = _progressWindow.document.createTextNode(text);
			
			newDescription.appendChild(newText);
			newHB.appendChild(newDescription);
			_progressWindow.document.getElementById("scholar-progress-text-box").appendChild(newHB);
			
			_move();
		} else {
			_loadDescription = text;
		}
	}
	
	function fade() {
		setTimeout(_timeout, 2500);
	}
	
	function kill() {
		_windowLoaded = false;
		try {
			_progressWindow.close();
		} catch(ex) {}
	}
	
	function _onWindowLoaded() {
		_windowLoading = false;
		_windowLoaded = true;
		
		_move();
		// do things we delayed because the winodw was loading
		changeHeadline(_loadHeadline);
		addLines(_loadLines, _loadIcons);
		if(_loadDescription) {
			addDescription(_loadDescription);
		}
		
		// reset parameters
		_loadDescription = null;
		_loadLines = new Array();
		_loadIcons = new Array();
		_loadHeadline = Scholar.getString("ingester.scraping")
	}
	
	function _move() {
		_progressWindow.sizeToContent();
		_progressWindow.moveTo(
			window.screenX + window.outerWidth - _progressWindow.outerWidth - 30,
			window.screenY + window.outerHeight - _progressWindow.outerHeight
		);
	}
	
	function _timeout() {
		kill();	// could check to see if we're really supposed to fade yet
				// (in case multiple scrapers are operating at once)
	}
}
