import { CloseOutlined, EditOutlined } from '@ant-design/icons';
import { useState } from 'react';
import Modal from 'react-modal';
import { toast } from 'react-toastify';
import { updatePost } from '~/services/api';
import { IError, IPost } from '~/types/types';

interface IProps {
    isOpen: boolean;
    onAfterOpen?: () => void;
    closeModal: () => void;
    openModal: () => void;
    post: IPost;
    updateSuccessCallback: (post: IPost) => void;
}

Modal.setAppElement('#root');

const EditPostModal: React.FC<IProps> = (props) => {
    const [description, setDescription] = useState(props.post.description || '');
    const [isUpdating, setIsUpdating] = useState(false);
    const [error, setError] = useState<IError | null>(null);

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setDescription(val);
    }

    const handleUpdatePost = async () => {
        try {
            setIsUpdating(true);
            const updatedPost = await updatePost(props.post.id, { description: description.trim() });

            console.log(updatedPost)
            props.updateSuccessCallback(updatedPost);
            setIsUpdating(false);
            props.closeModal();
            toast.dark('Post updated successfully.', {
                progressStyle: { backgroundColor: '#4caf50' }
            });
        } catch (e) {
            setIsUpdating(false);
            setError(e);
        }
    };

    return (
        <Modal
            isOpen={props.isOpen}
            onAfterOpen={props.onAfterOpen}
            onRequestClose={props.closeModal}
            contentLabel="Example Modal"
            className="modal"
            shouldCloseOnOverlayClick={false}
            overlayClassName="modal-overlay"
        >
            <div className="relative">
                <div
                    className="absolute right-2 top-2 p-1 rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-200"
                    onClick={props.closeModal}
                >
                    <CloseOutlined className="p-2  outline-none text-gray-500" />
                </div>
                {error && (
                    <span className="p-4 bg-red-100 text-red-500 block">
                        {error?.error?.message || 'Unable process request. Please try again.'}
                    </span>
                )}
                <div className="p-4 laptop:px-8 w-full laptop:w-40rem">
                    <h2>
                        <EditOutlined className="inline-flex items-center justify-center mr-2 pt-2" />
                        Edit Post
                    </h2>
                    <br />
                    <label htmlFor="update-post">Description</label>
                    <textarea
                        name="update-post"
                        id="update-post"
                        cols={30}
                        rows={3}
                        readOnly={isUpdating}
                        onChange={handleDescriptionChange}
                        value={description}
                    />
                    <div className="flex justify-between mt-4">
                        <button
                            className="button--muted !rounded-full"
                            onClick={props.closeModal}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUpdatePost}
                            disabled={isUpdating}
                        >
                            Update
                        </button>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default EditPostModal;
