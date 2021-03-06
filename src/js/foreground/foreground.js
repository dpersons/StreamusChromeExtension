﻿define([
    'background/collection/playlists',
    'background/collection/searchResults',
    'background/collection/streamItems',
    'background/model/player',
    'background/model/settings',
    'background/model/user',
    'common/enum/playerState',
    'common/enum/youTubePlayerError',
    'foreground/eventAggregator',
    'foreground/collection/contextMenuItems',
    'foreground/model/contextMenu',
    'foreground/model/playlistsArea',
    'foreground/model/notification',
    'foreground/model/search',
    'foreground/view/contextMenuView',
    'foreground/view/notificationView',
    'foreground/view/leftBasePane/leftBasePaneView',
    'foreground/view/leftCoveringPane/playlistsAreaView',
    'foreground/view/leftCoveringPane/searchView',
    'foreground/view/prompt/notificationPromptView',
    'foreground/view/prompt/reloadStreamusPromptView',
    'foreground/view/prompt/updateStreamusPromptView',
    'foreground/view/rightBasePane/rightBasePaneView'
], function (Playlists, SearchResults, StreamItems, Player, Settings, User, PlayerState, YouTubePlayerError, EventAggregator, ContextMenuItems, ContextMenu, PlaylistsArea, Notification, Search, ContextMenuView, NotificationView, LeftBasePaneView, PlaylistsAreaView, SearchView, NotificationPromptView, ReloadStreamusPromptView, UpdateStreamusPromptView, RightBasePaneView) {

    var ForegroundView = Backbone.Marionette.Layout.extend({
        el: $('body'),

        events: {
            //  TODO: is there no way to inline these event calls? Seems kinda silly to be so verbose.
            'click': function (event) {
                this.tryResetContextMenu(event);
                this.onClickDeselectCollections(event);
            },
            'contextmenu': 'tryResetContextMenu'
        },

        regions: {
            contextMenuRegion: "#context-menu-region",
            dialogRegion: '#dialog-region',
            leftBasePaneRegion: '#left-base-pane-region',
            leftCoveringPaneRegion: '#left-covering-pane-region',
            rightBasePaneRegion: '#right-base-pane-region'
        },

        //  TODO: Should I be using a Region to show my prompts? What if I ever wanted multi-level prompts? Hum.
        reloadPromptView: null,
        showReloadPromptTimeout: null,

        initialize: function () {
            
            $.extend($.fn.qtip.defaults.position, {
                viewport: $(window),
                my: 'top center',
                at: 'bottom center'
            });

            $.extend($.fn.qtip.defaults.style, {
                classes: 'qtip-light qtip-shadow'
            });
            
            //  Check if the YouTube player is loaded. If it isn't, give it a few seconds before allowing the user to restart.
            if (!Player.get('ready')) {
                this.$el.addClass('loading');

                this.startShowReloadPromptTimer();

                this.listenToOnce(Player, 'change:ready', function () {
                    this.$el.removeClass('loading');
                    clearTimeout(this.showReloadPromptTimeout);

                    if (this.reloadStreamusPromptView !== null) {
                        this.reloadStreamusPromptView.remove();
                    }
                });
            }

            //  Make sure Streamus stays up to date because if my Server de-syncs people won't be able to save properly.
            //  http://developer.chrome.com/extensions/runtime#method-requestUpdateCheck
            chrome.runtime.requestUpdateCheck(function (updateCheckStatus) {

                switch (updateCheckStatus) {
                    case 'update_available':
                        var updateStreamPromptView = new UpdateStreamusPromptView();
                        updateStreamPromptView.fadeInAndShow();
                        break;
                    case 'no_update':
                    case 'throttled':
                        //  Nothing to do -- just can't ask again for a while if throttled, but that's pretty unlikely to happen, I think!
                        break;
                }
                
            });

            this.rightBasePaneRegion.show(new RightBasePaneView({
                model: Player
            }));

            this.leftBasePaneRegion.show(new LeftBasePaneView());

            if (Settings.get('alwaysOpenToSearch')) {
                this.showSearch(false);
            }

            this.listenTo(Settings, 'change:showTooltips', this.setHideTooltipsClass);
            this.setHideTooltipsClass();

            this.listenTo(Player, 'error', this.showYouTubeError);
            this.listenTo(Player, 'change:state', this.setPlayerStateClass);
            this.setPlayerStateClass();

            //  Only bind to unload in one spot -- the foreground closes unstoppably and not all unload events will fire reliably.
            $(window).unload(function () {
                this.deselectCollections();
                
                //  There's a "bug" in how chrome extensions work. Window unload can be shut down early before all events finish executing.
                //  So it's necessary to invert the dependency of unsubscribing foreground view events from the foreground to the background where code is guaranteed to finish executing.
                chrome.extension.getBackgroundPage().unbindViewEvents(Backbone.View);
                
                //  The SearchView needs to run its close logic. I can't rely on actually closing it, though, apparently.
                if (this.leftCoveringPaneRegion.currentView instanceof SearchView) {
                    this.leftCoveringPaneRegion.currentView.onClose();
                }
            }.bind(this));

            EventAggregator.on('showSearch', function () {
                this.showSearch(true);
            }.bind(this));

            EventAggregator.on('showPlaylistsArea', function () {
                this.showPlaylistsArea();
            }.bind(this));
            
            //  Automatically sign the user in once they've actually interacted with Streamus.
            //  Don't sign in when the background loads because people who don't use Streamus, but have it installed, will bog down the server.
            if (User.canSignIn()) {
                User.signIn();
            }
        },
        
        setHideTooltipsClass: function() {
            this.$el.toggleClass('hide-tooltips', !Settings.get('showTooltips'));
        },

        //  If the foreground hasn't properly initialized after 5 seconds offer the ability to restart the program.
        //  Background.js might have gone awry for some reason and it is not always clear how to restart Streamus via chrome://extension
        startShowReloadPromptTimer: function () {
            this.showReloadPromptTimeout = setTimeout(function () {
                this.reloadStreamusPromptView = new ReloadStreamusPromptView();
                this.reloadStreamusPromptView.fadeInAndShow();
            }.bind(this), 5000);
        },

        //  Whenever the user clicks on any part of the UI that isn't a multi-select item, deselect the multi-select items.
        onClickDeselectCollections: function (event) {
            var isMultiSelectItem = $(event.target).hasClass('multi-select-item');

            //  Might've clicked inside of a multi-select item in which case you the de-select should not occur.
            var parentMultiSelectItem = $(event.target).closest('.multi-select-item');
            var isChildMultiSelectItem = parentMultiSelectItem.length > 0;

            if (!isMultiSelectItem && !isChildMultiSelectItem) {
                this.deselectCollections();
            }

            //  When clicking inside of a given multi-select, other multi-selects should be de-selected from.
            //  TODO: This is WAAAY too manual. Not sure how to clean it up just yet.
            var isPlaylistItem = $(event.target).hasClass('playlist-item') || parentMultiSelectItem.hasClass('playlist-item');
            if (isPlaylistItem) {
                SearchResults.deselectAll();
                StreamItems.deselectAll();
            }
            
            var isStreamItem = $(event.target).hasClass('stream-item') || parentMultiSelectItem.hasClass('stream-item');
            if (isStreamItem) {
                SearchResults.deselectAll();
                
                //  There's only an active playlist once the user has signed in.
                if (User.get('signedIn')) {
                    Playlists.getActivePlaylist().get('items').deselectAll();
                }
            }
            
            var isSearchResult = $(event.target).hasClass('search-result') || parentMultiSelectItem.hasClass('search-result');
            if (isSearchResult) {
                StreamItems.deselectAll();
                
                if (User.get('signedIn')) {
                    Playlists.getActivePlaylist().get('items').deselectAll();
                }
            }
        },
        
        deselectCollections: function () {
            if (User.get('signedIn')) {
                Playlists.getActivePlaylist().get('items').deselectAll();
            }

            SearchResults.deselectAll();
            StreamItems.deselectAll();
        },

        //  Slides in PlaylistsAreaView from the left side.
        showPlaylistsArea: _.throttle(function () {

            //  Defend against spam clicking by checking to make sure we're not instantiating currently
            if (_.isUndefined(this.leftCoveringPaneRegion.currentView)) {

                var playlistsArea = new PlaylistsArea();

                //  Show the view using SearchResults collection in which to render its results from.
                this.leftCoveringPaneRegion.show(new PlaylistsAreaView({
                    model: playlistsArea,
                    collection: Playlists
                }));

                //  When the user has clicked 'close' button the view will slide out and destroy its model. Cleanup events.
                this.listenToOnce(playlistsArea, 'destroy', function () {
                    this.leftCoveringPaneRegion.close();
                });
            }

        }, 400),

        //  Slide in SearchView from the left hand side.
        showSearch: _.throttle(function (doSnapAnimation) {

            //  Defend against spam clicking by checking to make sure we're not instantiating currently
            if (_.isUndefined(this.leftCoveringPaneRegion.currentView)) {

                //  Create model for the view and indicate whether view should appear immediately or display snap animation.
                var search = new Search({
                    playlist: Playlists.getActivePlaylist(),
                    doSnapAnimation: doSnapAnimation
                });

                //  Show the view using SearchResults collection in which to render its results from.
                this.leftCoveringPaneRegion.show(new SearchView({
                    collection: SearchResults,
                    model: search
                }));

                //  When the user has clicked 'close search' button the view will slide out and destroy its model. Cleanup events.
                this.listenToOnce(search, 'destroy', function () {
                    this.leftCoveringPaneRegion.close();
                });

            } else {
                //  Highlight the fact that is already visible by shaking it.
                this.leftCoveringPaneRegion.currentView.shake();
            }

        }, 400),

        //  Whenever the YouTube API throws an error in the background, communicate
        //  that information to the user in the foreground via prompt.
        showYouTubeError: function (youTubeError) {

            var text = chrome.i18n.getMessage('errorEncountered');

            switch (youTubeError) {
                case YouTubePlayerError.InvalidParameter:
                    text = chrome.i18n.getMessage('youTubePlayerErrorInvalidParameter');
                    break;
                case YouTubePlayerError.VideoNotFound:
                    text = chrome.i18n.getMessage('youTubePlayerErrorSongNotFound');
                    break;
                case YouTubePlayerError.NoPlayEmbedded:
                case YouTubePlayerError.NoPlayEmbedded2:
                    text = chrome.i18n.getMessage('youTubePlayerErrorNoPlayEmbedded');
                    break;
            }

            var youTubePlayerErrorPrompt = new NotificationPromptView({
                text: text
            });

            youTubePlayerErrorPrompt.fadeInAndShow();
        },

        //  If a click occurs and the default isn't prevented, reset the context menu groups to hide it.
        //  Child elements will call event.preventDefault() to indicate that they have handled the context menu.
        tryResetContextMenu: function (event) {
            if (event.isDefaultPrevented()) {
                this.contextMenuRegion.show(new ContextMenuView({
                    collection: ContextMenuItems,
                    model: new ContextMenu({
                        top: event.pageY,
                        //  Show the element just slightly offset as to not break onHover effects.
                        left: event.pageX + 1
                    }),
                    containerHeight: this.$el.height(),
                    containerWidth: this.$el.width()
                }));
            } else {
                ContextMenuItems.reset();
                this.contextMenuRegion.close();
            }
        },
        
        //  Keep the player state represented on the body so CSS can be modified to reflect state.
        setPlayerStateClass: function () {
            var playerState = Player.get('state');
            this.$el.toggleClass('playing', playerState === PlayerState.Playing);
        }

    });

    //  Only could ever possibly want 1 of these views... there's only 1 foreground.
    return new ForegroundView();
});