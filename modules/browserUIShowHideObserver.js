/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Tree Style Tab.
 *
 * The Initial Developer of the Original Code is YUKI "Piro" Hiroshi.
 * Portions created by the Initial Developer are Copyright (C) 2014-2015
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): YUKI "Piro" Hiroshi <piro.outsider.reflex@gmail.com>
 *                 Infocatcher <https://github.com/Infocatcher>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ******/

var EXPORTED_SYMBOLS = ['BrowserUIShowHideObserver']; 

var DEBUG = false;

Components.utils.import('resource://treestyletab-modules/constants.js');

function BrowserUIShowHideObserver(aOwner, aBox) {
	this.owner = aOwner;
	this.box = aBox;
	this.init();
}
BrowserUIShowHideObserver.prototype = {
	get MutationObserver()
	{
		var w = this.box.ownerDocument.defaultView;
		return w.MutationObserver || w.MozMutationObserver;
	},

	init : function BrowserUIShowHideObserver_onInit() 
	{
		if (!this.MutationObserver)
			return;
		this.observer = new this.MutationObserver((function(aMutations, aObserver) {
			this.onMutation(aMutations, aObserver);
		}).bind(this));
		this.observer.observe(this.box, {
			childList       : true,
			attributes      : true,
			subtree         : true,
			attributeOldValue: DEBUG,
			attributeFilter : [
				'hidden',
				'collapsed',
				'moz-collapsed', // Used in full screen mode
				'disablechrome',
				'width',
				'height'
			]
		});
	},
	onMutation : function BrowserUIShowHideObserver_onMutation(aMutations, aObserver) 
	{
		aMutations.forEach(function(aMutation) {
			switch (aMutation.type)
			{
				case 'childList':
					if (aMutation.target == this.box)
						this.owner.browser.treeStyleTab.updateFloatingTabbar(TreeStyleTabConstants.kTABBAR_UPDATE_BY_WINDOW_RESIZE);
					return;

				case 'attributes':
					this.onAttributeModified(aMutation, aObserver);
					return;
			}
		}, this);
	},

	destroy : function BrowserUIShowHideObserver_destroy()
	{
		if (this.observer) {
			this.observer.disconnect();
			delete this.observer;
		}
		delete this.box;
		delete this.owner;
	},

	onAttributeModified : function BrowserUIShowHideObserver_onAttributeModified(aMutation, aObserver) 
	{
		if (this.handlingAttrChange)
			return;

		var target = aMutation.target;
		var state = this.serializeBoxState(target);
		if (target.__treestyletab_mutationObserver_lastState == state)
			return;

		var TST = this.owner.browser.treeStyleTab;
		if (
			// ignore modifications of each tab
			TST.getTabFromChild(target) ||
			// ignore modifications in the location bar (ex. identity icon)
			TST.evaluateXPath(
				'ancestor-or-self::xul:textbox',
				target,
				Components.interfaces.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue
			)
			return;

		var toolbarVisible     = !TST.ownerToolbar.collapsed;
		var tabbarVisible      = this.owner.browser.tabContainer.visible;
		var placeHolderVisible = !TST.tabStripPlaceHolder.collapsed;
		var tabbarVisibilityMismatching = (
			toolbarVisible != placeHolderVisible ||
			tabbarVisible  != placeHolderVisible
		);

		if (
			// I must ignore show/hide of elements managed by TST,
			// to avoid infinity loop.
			TST.evaluateXPath(
				'ancestor-or-self::xul:*[@' + TreeStyleTabConstants.kTAB_STRIP_ELEMENT + '="true"]',
				target,
				Components.interfaces.nsIDOMXPathResult.FIRST_ORDERED_NODE_TYPE
			).singleNodeValue &&
			// However, I have to synchronize visibility of the real
			// tab bar and the placeholder's one. If they have
			// different visibility, then the tab bar is shown or
			// hidden by "auto hide tab bar" feature of someone
			// (Pale Moon, Tab Mix Plus, etc.)
			!tabbarVisibilityMismatching
			)
			return;

		if (DEBUG) {
			dump('BrowserUIShowHideObserver_onAttributeModified ' +
			     target.localName + '#' + target.id + '.' + target.className + ', ' +
			     aMutation.attributeName + ', ' +
			     aMutation.oldValue + ' => ' +
			     target.getAttribute(aMutation.attributeName) + '\n');
		}

		this.handlingAttrChange = true;

		TST.updateFloatingTabbar(TreeStyleTabConstants.kTABBAR_UPDATE_BY_WINDOW_RESIZE);

		var w = this.box.ownerDocument.defaultView;
		w.setTimeout((function() {
			target.__treestyletab_mutationObserver_lastState = this.serializeBoxState(target);
			this.handlingAttrChange = false;
		}).bind(this), 10);
	},

	serializeBoxState : function BrowserUIShowHideObserver_serializeBoxState(aElement)
	{
		aElement = aElement || this.box;
		var box = aElement.boxObject || {}; // Some times there is no boxObject (ex. HTML element)
		return JSON.stringify({
			width  : box.width || 0,
			height : box.height || 0,
			hidden : Boolean(aElement.hidden),
			collapsed : Boolean(aElement.collapsed)
		});
	}
};
