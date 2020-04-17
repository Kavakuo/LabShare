import express from "express";
import { Validator as v } from "../../lib/validation";
import { getModelForRole, getUserById, getUserOrAdmin, getUser, UserCommon } from '../database/database';
import { IUserCommon } from '../database/schemas/IUserCommon';
import JsonSchema, { schemaForRole } from "../jsonSchemas/JsonSchema";
import utils from '../utils';
import { NOT_FOUND } from 'http-status-codes';
import { UserRoles } from '../../lib/userRoles';

class Profile {
    public async get(req: express.Request, res: express.Response, next: express.NextFunction) {
        let token = utils.getUnverifiedDecodedJWT(req);
        
        let user = await getUserOrAdmin({_id: token.sub});
        if (!user) {
            return utils.badRequest(res);
        }

        let data = JSON.parse(JSON.stringify(user));
        delete data._id;
        delete data.__v;
        delete data.__t;
        delete data.password;

        let responseData = {
            success: true,
            data: data
        };

        res.send(responseData);
    }


    public async getForSlug(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!req.params.id) {
            next()
            return
        }

        let token = await utils.getVerifiedDecodedJWT(req)

        let projection: { [key: string]: number } = {
            'location': 1,
            'address': 1,
            'description': 1,
            'role': 1,
            'offers': 1,
            'lookingFor': 1,
            'organization': 1,
            'contact': 1,
            'details': 1,
            'slug': 1
        }

        let filter: any = {
            slug: req.params.id,
            'consent.publicSearch': true,
            'verified.manually': true,
            'verified.mail': true
        }

        let user = await UserCommon.findOne(filter).select(projection).exec();
        if (!user) {
            return utils.errorResponse(res, NOT_FOUND, "not_found")
        }

        let a: IUserCommon = user.toObject()

        delete a._id
        delete a.__v

        if (!token || (token && token.role === UserRoles.VOLUNTEER)) {
            delete a.contact

            if (a.role === UserRoles.VOLUNTEER) {
                delete a.organization
            }
        }

        if (token && token.role !== UserRoles.LAB_DIAG && a.role == UserRoles.VOLUNTEER) {
            delete a.contact
            delete a.organization
        }


        res.send({
            success: true,
            data: a
        })
    }


    async post(req: express.Request, res: express.Response, next: express.NextFunction) {
        let body: IUserCommon = req.body;
        let token = utils.getUnverifiedDecodedJWT(req);
        
        delete body.password
        delete body._id
        delete body.__v
        delete body.__t
        delete body.verified
        delete body.disabled
        delete body.language
        delete body.slug;
        
        let model = getModelForRole(token.role)
        let schema = schemaForRole(token.role)
        if (!model || !schema) return utils.badRequest(res);

        delete schema.required

        let valResult = v.validProfileFields(body, token.role)
        if (!JsonSchema.validate(body, schema) || !valResult.valid) {
            if (!valResult.valid) return utils.handleError(res, valResult.err);
            return utils.badRequest(res)
        }

        let user = await getUserById(token.sub)
        if (!user) {
            return utils.badRequest(res)
        }
        let userObj: IUserCommon = user.toObject()

        if (body.address && 
            (userObj.address.zipcode != body.address.zipcode ||
            userObj.address.street != body.address.street ||
            userObj.address.city != body.address.city)) {
                try {
                    body.location = await utils.addressToCoordinates(userObj.address)
                } catch (error) {
                    return utils.handleError(res, error)
                }
            }

        model.updateOne({_id: token.sub}, body).exec().then(doc => {
            utils.successResponse(res)
        }).catch(err => {
            utils.internalError(res)
        })
    }



    async delete(req: express.Request, res: express.Response, next: express.NextFunction) {
        let token = utils.getUnverifiedDecodedJWT(req);
        let model = getModelForRole(token.role)
        if (!model) {
            return utils.badRequest(res)
        }

        model.deleteOne({ _id: token.sub }).exec().then((doc) => {
            if (!doc)
                return utils.internalError(res);
            return utils.successResponse(res);
        }).catch((err) => {
            return utils.internalError(res);
        });
    }
}

export default new Profile()
