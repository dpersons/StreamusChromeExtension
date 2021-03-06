﻿define([
    'background/collection/streamItems',
    'text!template/addToStreamButton.html'
], function (StreamItems, AddToStreamButtonTemplate) {
    'use strict';

    var AddToStreamButtonView = Backbone.Marionette.ItemView.extend({
        
        tagName: 'button',
        className: 'button-icon colored',
        template: _.template(AddToStreamButtonTemplate),
        
        attributes: {
            title: chrome.i18n.getMessage('add')
        },
        
        events: {
            'click': 'addToStream',
            'dblclick': 'addToStream'
        },

        initialize: function () {
            this.$el.qtip();
        },
        
        addToStream: _.debounce(function () {
            StreamItems.addSongs(this.model.get('song'));

            //  Don't allow dblclick to bubble up to the list item and cause a play.
            return false;
        }, 100, true)

    });

    return AddToStreamButtonView;
});