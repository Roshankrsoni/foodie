import { useEffect, useRef, useState } from "react";
import useInfiniteScroll from "react-infinite-scroll-hook";
import { Redirect, RouteComponentProps, useLocation } from "react-router-dom";
import Loader from "~/components/shared/Loader";
import { UserLoader } from "~/components/shared/Loaders";
import { search } from "~/services/api";
import { IPost, IProfile } from "~/types/types";
import Posts from "./Posts";
import Users from "./Users";


const useQuery = () => {
    return new URLSearchParams(useLocation().search);
}

const Search: React.FC<RouteComponentProps> = ({ history }) => {
    const [users, setUsers] = useState<IProfile[]>([]);
    const [posts, setPosts] = useState<IPost[]>([]);
    const [error, setError] = useState('');
    const [userOffset, setUserOffset] = useState(0);
    const [postOffset, setPostOffset] = useState(0);
    const [isLoadingUser, setIsLoadingUser] = useState(false);
    const [isLoadingPost, setIsLoadingPost] = useState(false);
    const query = useQuery();
    let isMountedRef = useRef<boolean | null>(null);
    const searchQuery = query.get('q');
    const searchType = query.get('type');

    useEffect(() => {
        if (isMountedRef) isMountedRef.current = true;

        return () => {
            if (isMountedRef) isMountedRef.current = false;
        }
    }, []);

    useEffect(() => {
        if (searchType === 'posts') {
            dispatchSearchPosts();
        } else {
            dispatchSearchUsers();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchType, searchQuery]);

    const dispatchSearchPosts = async () => {
        try {
            if (searchQuery && searchType) {
                setIsLoadingPost(true);
                setError('');
                const fetchedPosts = await search({ q: searchQuery, type: 'posts', offset: postOffset });

                if (isMountedRef.current) {
                    setPosts([...posts, ...fetchedPosts]);
                    setIsLoadingPost(false);
                    setPostOffset(postOffset + 1);

                    if (fetchedPosts.length === 0) {
                        setError('No posts found.');
                    }
                }
            }
        } catch (e) {
            setIsLoadingPost(false);
            setError(e.error.message);
        }
    }

    const dispatchSearchUsers = async () => {
        try {
            if (searchQuery) {
                setError('');
                setIsLoadingUser(true);
                const fetchedUsers = await search({ q: searchQuery, offset: userOffset });

                if (isMountedRef.current) {
                    setUsers([...users, ...fetchedUsers]);
                    setIsLoadingUser(false);
                    setUserOffset(userOffset + 1);

                    if (fetchedUsers.length === 0) {
                        setError('No users found.');
                    }
                }
            }
        } catch (e) {
            setIsLoadingUser(false);
            setError(e.error.message);
        }
    }

    const onClickUserTab = () => {
        history.push(`/search?q=${searchQuery}`)
    }

    const onClickPostTab = () => {
        history.push(`/search?q=${searchQuery}&type=posts`)
    }

    const infiniteUserRef = useInfiniteScroll({
        loading: isLoadingUser,
        hasNextPage: !error && users.length >= 10,
        onLoadMore: dispatchSearchUsers,
        scrollContainer: 'window',
        threshold: 100
    });

    const infinitePostRef = useInfiniteScroll({
        loading: isLoadingPost,
        hasNextPage: !error && posts.length >= 10,
        onLoadMore: dispatchSearchPosts,
        scrollContainer: 'window',
        threshold: 100
    });

    return !searchQuery ? <Redirect to={'/'} /> : (
        <div className="min-h-screen pt-20">
            <div className="contain">
                <h2 className="text-lg laptop:text-2xl">
                    You searched for:
                    <span className="text-indigo-700">{searchQuery}</span>
                </h2>
                <span className="text-gray-400">Search Result</span>
                <ul className="space-x-4 mt-4">
                    <li
                        className={`inline-block border-b-4 border-transparent px-2 py-4 cursor-pointer font-medium hover:border-indigo-700 text-gray-400 ${searchType !== 'posts' && ' border-indigo-700 text-gray-900'}`}
                        onClick={onClickUserTab}
                    >
                        Users
                    </li>
                    <li
                        className={`inline-block border-b-4 border-transparent px-2 py-4 cursor-pointer font-medium hover:border-indigo-700 text-gray-400 ${searchType === 'posts' && ' border-indigo-700 text-gray-900'}`}
                        onClick={onClickPostTab}
                    >
                        Posts
                    </li>
                </ul>
            </div>
            <div className="contain bg-gray-200 py-8 min-h-10rem">
                <div className="w-full laptop:w-3/4">
                    {searchType === 'posts' ? (
                        <div ref={infinitePostRef as React.RefObject<HTMLDivElement>}>
                            {(isLoadingPost && posts.length === 0) && (
                                <div className="p-4 flex items-center justify-center">
                                    <Loader />
                                </div>
                            )}
                            {(!isLoadingPost && posts.length === 0 && error) && (
                                <div className="p-4 flex items-center justify-center">
                                    <span className="text-gray-400 italic font-medium">{error}</span>
                                </div>
                            )}
                            {(posts.length !== 0) && (
                                <Posts posts={posts} searchQuery={searchQuery} />
                            )}
                            {(isLoadingPost && posts.length >= 10 && !error) && (
                                <div className="px-4 py-14 flex items-center justify-center">
                                    <Loader />
                                </div>
                            )}
                        </div>
                    ) : (
                            <div ref={infiniteUserRef as React.RefObject<HTMLDivElement>}>
                                {(isLoadingUser && users.length === 0) && (
                                    <div className="min-h-10rem">
                                        <UserLoader backgroundColor="#dadada" />
                                        <UserLoader backgroundColor="#dadada" />
                                        <UserLoader backgroundColor="#dadada" />
                                        <UserLoader backgroundColor="#dadada" />
                                        <UserLoader backgroundColor="#dadada" />
                                    </div>
                                )}
                                {(!isLoadingUser && users.length === 0 && error) && (
                                    <div className="p-4 flex items-center justify-center">
                                        <span className="text-gray-400 italic font-medium">{error}</span>
                                    </div>
                                )}
                                {(users.length !== 0) && <Users users={users} />}
                                {(isLoadingUser && users.length >= 10 && !error) && (
                                    <div className="px-4 py-14 flex items-center justify-center">
                                        <Loader />
                                    </div>
                                )}
                            </div>
                        )}
                </div>
            </div>
        </div>
    );
};

export default Search;
