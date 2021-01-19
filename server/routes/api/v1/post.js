const { isAuthenticated, validateObjectID } = require('../../../middlewares/middlewares');
const { validateBody, schemas } = require('../../../validations/validations');
const Post = require('../../../schemas/PostSchema');
const { makeResponseJson, makeErrorJson } = require('../../../helpers/utils');
const User = require('../../../schemas/UserSchema');
const { isValidObjectId, Types } = require('mongoose');
const Follow = require('../../../schemas/FollowSchema');
const NewsFeed = require('../../../schemas/NewsFeedSchema');
const Notification = require('../../../schemas/NotificationSchema');
const Comment = require('../../../schemas/CommentSchema');
const Bookmark = require('../../../schemas/BookmarkSchema');
const { multer, uploadImageToStorage, deleteImageFromStorage } = require('../../../storage/filestorage');

const router = require('express').Router({ mergeParams: true });

router.post(
    '/v1/post',
    isAuthenticated,
    multer.array('photos', 5),
    validateBody(schemas.createPostSchema),
    async (req, res, next) => {
        try {
            const { description, privacy } = req.body;

            let photos = [];
            if (req.files) {
                const photosToSave = req.files.map((file) => uploadImageToStorage(file));
                photos = await Promise.all(photosToSave);

                console.log(photos)
            }

            const post = new Post({
                _author_id: req.user._id,
                // author: req.user._id,
                description,
                photos,
                privacy: privacy || 'public',
                createdAt: Date.now()
            });

            await post.save();
            await post.populate('author', 'profilePicture username fullname').execPopulate();

            const myFollowers = await Follow.findOne({ _user_id: req.user._id });
            let newsFeeds = [];

            // add post to follower's newsfeed
            if (myFollowers && myFollowers.followers) {
                newsFeeds = myFollowers.followers.map(follower => ({
                    follower: Types.ObjectId(follower._id),
                    post: Types.ObjectId(post._id),
                    post_owner: req.user._id,
                    createdAt: post.createdAt
                }));
            }
            // append own post on newsfeed
            newsFeeds = newsFeeds.concat({
                follower: req.user._id,
                post_owner: req.user._id,
                post: Types.ObjectId(post._id),
                createdAt: post.createdAt
            });

            if (newsFeeds.length !== 0) {
                await NewsFeed.insertMany(newsFeeds);
            }

            // Notify followers that new post has been made 
            const io = req.app.get('io');
            myFollowers.followers.forEach((user) => {
                io.to(user._id.toString()).emit('newFeed', post);
            });

            return res.status(200).send(makeResponseJson(post));
        } catch (e) {
            console.log(e);
            return res.status(401).send(makeErrorJson({ status_code: 401, message: 'You\'re not authorized to make a post.' }))
        }
    });

router.get(
    '/v1/:username/posts',
    isAuthenticated,
    async (req, res, next) => {
        try {
            const { username } = req.params;
            const { privacy, sortBy, sortOrder, offset: off } = req.query;

            let offset = 0;
            if (typeof off !== undefined && !isNaN(off)) offset = parseInt(off);

            const user = await User.findOne({ username });
            if (!user) return res.sendStatus(404);

            const limit = 5;
            const skip = offset * limit;

            const query = {
                _author_id: user._id,
                privacy: { $in: ['public'] },
            };
            const sortQuery = {
                [sortBy || 'createdAt']: sortOrder === 'asc' ? 1 : -1
            };

            if (username === req.user.username && privacy) {
                query.privacy.$in = ['public', privacy];
            }

            const posts = await Post
                .find(query)
                .sort(sortQuery)
                .populate('commentsCount')
                .populate('likesCount')
                .populate({
                    path: 'author',
                    select: 'username fullname profilePicture',
                })
                .skip(skip)
                .limit(limit);

            if (!posts || posts.length <= 0) {
                return res.status(404).send(makeErrorJson({ status_code: 404, message: 'No more posts.' }));
            }

            const uPosts = posts.map((post) => { // POST WITH isLiked merged
                const isPostLiked = post.isPostLiked(req.user._id);
                const isBookmarked = req.user.isBookmarked(post._id);

                return {
                    ...post.toObject(),
                    isBookmarked,
                    isLiked: isPostLiked
                }
            });

            res.status(200).send(makeResponseJson(uPosts));
        } catch (e) {
            console.log(e);
            res.status(400).send(makeErrorJson());
        }
    }
);

router.post(
    '/v1/like/post/:post_id',
    isAuthenticated,
    validateObjectID('post_id'),
    async (req, res, next) => {
        try {
            const { post_id } = req.params;

            const post = await Post.findById(post_id);

            if (!post) return res.sendStatus(404); // SEND 404 IF NO POST FOUND

            const isPostLiked = post.isPostLiked(req.user._id);
            let query = {};

            if (isPostLiked) {
                query = {
                    $pull: { likes: req.user._id }
                }
            } else {
                query = {
                    $push: { likes: req.user._id }
                }
            }

            const fetchedPost = await Post.findByIdAndUpdate(post_id, query, { new: true });
            await fetchedPost.populate('likesCount commentsCount').execPopulate();
            await fetchedPost.populate('author', 'fullname username profilePicture').execPopulate();
            const result = {
                ...fetchedPost.toObject(),
                isLiked: !isPostLiked,
            };

            if (!isPostLiked && result.author.id !== req.user._id.toString()) {
                const io = req.app.get('io');
                const targetUserID = result.author.id;
                const newNotif = {
                    type: 'like',
                    initiator: req.user._id,
                    target: targetUserID,
                    link: `/post/${post_id}`,
                };
                const notificationExists = await Notification.findOne(newNotif);

                if (!notificationExists) {
                    const notification = new Notification({ ...newNotif, createdAt: Date.now() });

                    const doc = await notification.save();
                    await doc.populate('target initiator', 'fullname profilePicture username').execPopulate();

                    io.to(targetUserID).emit('newNotification', { notification: doc, count: 1 });
                } else {
                    await Notification.findOneAndUpdate(newNotif, { $set: { createdAt: Date.now() } });
                }
            }

            res.status(200).send(makeResponseJson({ post: result, state: isPostLiked }));
        } catch (e) {
            console.log(e);
            res.status(500).send(makeErrorJson());
        }
    }
);

router.patch(
    '/v1/post/:post_id',
    isAuthenticated,
    validateObjectID('post_id'),
    validateBody(schemas.createPostSchema),
    async (req, res, next) => {
        try {
            const { post_id } = req.params;
            const { description, privacy } = req.body;
            const obj = { updatedAt: Date.now(), isEdited: true };

            if (!description && !privacy) return res.sendStatus(400);

            if (description) obj.description = description.trim();
            if (privacy && (privacy === 'public' || privacy === 'private')) obj.privacy = privacy;

            const post = await Post.findById(post_id);
            if (!post) return res.sendStatus(404);

            if (req.user._id.toString() === post._author_id.toString()) {
                const updatedPost = await Post.findByIdAndUpdate(post_id, {
                    $set: obj
                }, {
                    new: true
                });
                await updatedPost.populate('author', 'fullname, username, profilePicture').execPopulate();

                res.status(200).send(makeResponseJson(updatedPost));
            } else {
                res.sendStatus(401);
            }
        } catch (e) {
            console.log('CANT EDIT POST :', e);
            res.sendStatus(500);
        }
    }
);
// @route /post/:post_id -- DELETE POST
router.delete(
    '/v1/post/:post_id',
    isAuthenticated,
    validateObjectID('post_id'),
    async (req, res, next) => {
        try {
            const { post_id } = req.params;

            const post = await Post.findById(post_id);
            if (!post) return res.sendStatus(404);

            if (req.user._id.toString() === post._author_id.toString()) {
                await deleteImageFromStorage(...post.photos);
                await Post.findByIdAndDelete(post_id);
                await Comment.deleteMany({ _post_id: Types.ObjectId(post_id) });
                await NewsFeed.deleteMany({ post: Types.ObjectId(post_id) });
                await Bookmark.deleteMany({ _post_id: Types.ObjectId(post_id) });
                await User.updateMany({
                    bookmarks: {
                        $in: [post_id]
                    }
                }, {
                    $pull: {
                        bookmarks: post_id
                    }
                });


                res.sendStatus(200);
            } else {
                res.sendStatus(401);
            }
        } catch (e) {
            console.log('CANT DELETE POST', e);
            res.status(500).send(makeErrorJson());
        }
    }
);

router.get(
    '/v1/post/:post_id',
    isAuthenticated,
    validateObjectID('post_id'),
    async (req, res, next) => {
        try {
            const { post_id } = req.params;
            const post = await Post.findById(post_id);
            if (!post) {
                return res.status(404).send(makeErrorJson({ status_code: 404, message: 'Post not found.' }));
            }
            if (post.privacy === 'private' && post._author_id.toString() !== req.user._id.toString()) {
                return res.status(401).send(makeErrorJson({ status_code: 401, message: 'You\'re not authorized to view this' }))
            }

            await post.populate('author likesCount commentsCount', 'fullname username profilePicture').execPopulate();

            const isBookmarked = req.user.isBookmarked(post_id);
            const isPostLiked = post.isPostLiked(req.user._id);
            const result = { ...post.toObject(), isLiked: isPostLiked, isBookmarked };
            res.status(200).send(makeResponseJson(result));
        } catch (e) {
            console.log('CANT GET POST', e);
            res.status(500).send(makeErrorJson());
        }
    }
);

module.exports = router;
