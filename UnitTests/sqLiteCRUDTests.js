﻿$(document).ready(function () {
	if (!$data.storageProviders.sqLite.SqLiteStorageProvider.isSupported) return;

    var sqlite;

    $data.Class.define("$blog.Types.Blog", $data.Entity, null, {
        Id: { dataType: "int", key: true, computed: true },
        Name: { dataType: "string" },
        Posts: { dataType: "Array", elementType: "$blog.Types.BlogPost", inverseProperty: "Blog" }
    });

    $data.Class.define("$blog.Types.BlogPost", $data.Entity, null, {
        Id: { dataType: "int", key: true, computed: true },
        Title: { dataType: "string" },
        Body: { dataType: "string" },
        CreatedAt: { dataType: "datetime" },
        Blog: { dataType: "$blog.Types.Blog", inverseProperty: "Posts" }
    });

    $data.Class.define("$blog.Types.BlogContext", $data.EntityContext, null, {
        Blogs: { dataType: $data.EntitySet, elementType: $blog.Types.Blog },
        BlogPosts: { dataType: $data.EntitySet, elementType: $blog.Types.BlogPost }
    });



    module("sqLite CRUD tests", {
        setup: function () {
            stop(1);

            $blog.Context = new $blog.Types.BlogContext({ name: "sqLite", databaseName: "Blog", dbCreation: $data.storageProviders.sqLite.DbCreationType.DropAllExistsTables });
            $blog.Context.onReady(function (db) {
                WebSql.openDatabase($blog.Context.storageProvider.providerConfiguration.databaseName, $blog.Context.storageProvider.providerConfiguration.displayName, $blog.Context.storageProvider.providerConfiguration.maxSize).then(function (db) {
                    sqlite = db;
                    start();
                });
            });
        },
        teardown: function () {
            stop(1);

            sqlite.transaction(function (tr) {
                return $.Deferred(function (deferred) {
                    tr.executeSql('DELETE FROM BlogPosts').
                        pipe(function () {
                            return tr.executeSql('DELETE FROM Blogs');
                        }).then(deferred.resolve, deferred.reject);
                    deferred.resolve();
                });
            }).then(start, console.error);
        }
    });


    function asyncFailedCallback(message) {
        return function (error) {
            console.error(error);
            ok(false, message);
            start();
        };
    }

    function asyncEqual(actual, expected, message) {
        equal(actual, expected, message);
        start();
        return actual == expected;
    }

    function verifyCount(query, expected) {
        return $.Deferred(function (deferred) {
            sqlite.executeSql(query).then(function (sqlite, tr, result) {
                equal(result.rows.item(0).count, expected, query);
                deferred.resolve();
            }, deferred.reject);
        });
    }

    asyncTest("Insert one record", 1, function () {
        var blog = new $blog.Types.Blog({ Name: "Comment" });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges(function () {
            sqlite.executeSql('SELECT COUNT(*) AS count FROM Blogs').done(function (sqlite, tr, result) {
                equal(result.rows.item(0).count, 1, '');
                start();
            });
        });
    });

    asyncTest("Insert one record and check it", 1, function () {
        expect(2);

        var blog = new $blog.Types.Blog({ Name: "Comment" });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges().then(
            sqlite.executeSql('SELECT COUNT(*) AS count FROM Blogs').then(
                function (sqlite, tr, result) {
                    if (asyncEqual(result.rows.item(0).count, 1)) {
                        sqlite.executeSql('SELECT * FROM Blogs').then(
                            function (sqlite, tr, result) {
                                var blogRow = result.rows.item(0);

                                equal(blogRow.Name, 'Comment');
                                start();
                            },
                            asyncFailedCallback('verification query failed'));
                    }
                },
                asyncFailedCallback('verification query failed')),
            asyncFailedCallback('failed save changes'));
    });

    asyncTest("Insert one blog with posts", 1, function () {
        var blog = new $blog.Types.Blog({
            Name: "Comment",
            Posts: [new $blog.Types.BlogPost({ Title: "title", Body: 'body', CreatedAt: new Date() })]
        });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges(function () {
            sqlite.executeSql('SELECT COUNT(*) AS count FROM Blogs WHERE Blogs.Id IN (SELECT Blog__Id FROM BlogPosts)').done(function (sqlite, tr, result) {
                equal(result.rows.item(0).count, 1, '');
                start();
            });
        });
    });

    asyncTest("Insert null datetime", 1, function () {
        var blog = new $blog.Types.Blog({
            Name: "Comment",
            Posts: [new $blog.Types.BlogPost({ Title: "title", Body: 'body', CreatedAt: null })]
        });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges(function () {
            verifyCount('SELECT COUNT(*) AS count FROM BlogPosts WHERE CreatedAt IS NULL', 1).then(start, asyncFailedCallback('failed to verify'));
        });
    });

    asyncTest("Insert orphan blog post", 1, function () {
        var post = new $blog.Types.BlogPost({ Title: "title", Body: "body", CreatedAt: new Date() });
        $blog.Context.BlogPosts.add(post);

        $blog.Context.saveChanges().then(function () {
            verifyCount('SELECT COUNT(*) AS count FROM BlogPosts', 1).then(start, asyncFailedCallback('failed to verify'));
        },
        asyncFailedCallback('save failed'));
    });

    asyncTest("Insert empty entity", 1, function () {
        raises(function () {
                var blog = new $blog.Types.Blog();
                $blog.Context.Blogs.add(blog);
                $blog.Context.saveChanges().then(function () {
                    verifyCount('SELECT COUNT(*) AS count FROM Blogs', 0).then(start, asyncFailedCallback('failed to verify'));
                },
                asyncFailedCallback('save failed'));
            }, function (ex) {
                start();
                return ex.message && ex.message == 'None of the fields contain values in the entity to be saved.';
            },
            'Exception expected');
    });


    asyncTest("Update record", 1, function () {
        var blog = new $blog.Types.Blog({ Name: "Comment" });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges().then(function () {
            $blog.Context.Blogs.attach(blog);
            blog.Name = 'xxx';

            $blog.Context.saveChanges().then(function () {
                sqlite.executeSql('SELECT * FROM Blogs').then(
                    function (sqlite, tr, result) {
                        var blogRow = result.rows.item(0);

                        equal(blogRow.Name, 'xxx');
                        start();
                    },
                    asyncFailedCallback('verification query failed'));
            },
            asyncFailedCallback('update failed'));
        },
        asyncFailedCallback('failed save changes'));
    });

    asyncTest("Update Blog navigation property", 1, function () {
        expect(3);

        var post = new $blog.Types.BlogPost({ Title: "title", Body: 'body', CreatedAt: null });
        var commentBlog = new $blog.Types.Blog({
            Name: "Comment",
            Posts: [post]
        });
        var subbaBlog = new $blog.Types.Blog({ Name: 'subba' });
        $blog.Context.Blogs.add(commentBlog);
        $blog.Context.Blogs.add(subbaBlog);

        $blog.Context.saveChanges().then(function () {
            
            verifyCount('SELECT COUNT(*) AS count FROM BlogPosts WHERE Blog__Id = (SELECT Id FROM Blogs WHERE Name = \'Comment\')', 1).then(function () {
                $blog.Context.Blogs.attach(commentBlog);
                $blog.Context.Blogs.attach(subbaBlog);
                $blog.Context.BlogPosts.attach(post);

                post.Blog = subbaBlog;
                subbaBlog.Posts = [post];
                commentBlog.Posts = [];

                $blog.Context.saveChanges().then(function () {
                    verifyCount('SELECT COUNT(*) AS count FROM BlogPosts WHERE Blog__Id = (SELECT Id FROM Blogs WHERE Name = \'subba\')', 1).then(function () {
                        $blog.Context.BlogPosts.attach(post);

                        post.Blog = null;
                        $blog.Context.saveChanges().then(function () {
                            verifyCount('SELECT COUNT(*) AS count FROM BlogPosts WHERE Blog__Id IS NULL', 1).then(start, asyncFailedCallback('verify error'));
                        },
                        asyncFailedCallback('update to null failed'));
                    },
                    asyncFailedCallback("verify error"));
                },
                asyncFailedCallback('update failed'));
            },
            asyncFailedCallback('verify failed'));
        },
        asyncFailedCallback('save failed'))
    });


    asyncTest("Delete", 1, function () {
        var blog = new $blog.Types.Blog({ Name: "Comment" });
        $blog.Context.Blogs.add(blog);

        $blog.Context.saveChanges().then(function () {
            $blog.Context.Blogs.attach(blog);

            $blog.Context.Blogs.remove(blog);
            $blog.Context.saveChanges().then(function () {
                verifyCount('SELECT COUNT(*) AS count FROM Blogs', 0).then(start, asyncFailedCallback('verify error'));
            },
            asyncFailedCallback('delete failed'));
        },
        asyncFailedCallback('save failed'));
    });





    var WebSql = {
        openDatabase: function (name, displayName, estimatedSize) {
            return $.Deferred(function (deferred) {
                try {
                    var db = window.openDatabase(name, '', displayName, estimatedSize);

                    // define deferred Database.transaction
                    var transaction = db.transaction;
                    db.transaction = function (callback) {
                        return $.Deferred(function (deferred) {
                            transaction.call(db, function (tr) {
                                // define deferred SqlTransaction.executeSql
                                var executeSql = tr.executeSql;
                                tr.executeSql = function (sqlStatement, args) {
                                    return $.Deferred(function (deferred) {
                                        executeSql.call(tr, sqlStatement, args, function (tr, result) {
                                            deferred.resolve(db, tr, result);
                                        }, function (tr, error) {
                                            deferred.reject(db, tr, error);
                                        });
                                    });
                                };

                                callback(tr).done(function () {
                                    deferred.resolveWith(this, arguments);
                                });
                            }, function (error) {
                                deferred.reject(db, error);
                            });
                        });
                    };
                    db.executeSql = function (sqlStatement, args) {
                        return db.transaction(function (tr) {
                            return $.Deferred(function (deferred) {
                                tr.executeSql(sqlStatement, args).then(deferred.resolve, console.error);
                            });
                        });
                    }

                    deferred.resolve(db);
                } catch (ex) {
                    deferred.reject(ex);
                }
            });
        }
    };
});



